"use server";

// Server Actions de la FICHE PUBLIQUE (coproprietaire, NON authentifie). Contrat {ok,...} :
// jamais de throw cote client. Ces actions sont le SEUL point d'entree public de l'app :
// securite portee ICI (le proxy exclut /fiche/**).
//
// Modele de securite :
//   - le token (dans le lien) est hashe cote serveur avant tout lookup ; on ne compare que des hash ;
//   - AUCUNE PII n'est renvoyee tant que le code personnel n'est pas verifie (anti-enumeration :
//     token inconnu et mauvais code donnent le MEME resultat) ;
//   - honeypot anti-bot (champ cache qui doit rester vide) ;
//   - rate-limit basique par IP EN MEMOIRE (fenetre glissante) sur les deux actions ;
//   - une seule soumission par fiche (re-affichage read-only ensuite), verifiee cote serveur.

import { headers } from "next/headers";
import { z } from "zod";
import { consulterFiche, soumettreFiche } from "@/lib/reprise/services/fiches-renseignements";
import { getFicheRenseignementsRepository } from "@/lib/reprise/adapters/router";
import { hacher } from "@/lib/reprise/services/fiche-token";
import type { DonneesConnues, DonneesSoumises } from "@/lib/reprise/domain/fiche-renseignements";

// --- Rate-limit EN MEMOIRE (best-effort, par process) ---------------------------
// Limite : 12 tentatives / 5 min / IP. Suffisant contre le brute-force manuel/scripté leger.
// LIMITE ASSUMEE : en mémoire par process (multi-instance serverless = non partagé) et l'IP
// vient d'un header (x-forwarded-for, falsifiable). Ce n'est PAS un WAF ; c'est un premier mur.
const FENETRE_MS = 5 * 60_000;
const MAX_TENTATIVES = 12;
const seau = new Map<string, number[]>();

async function ipCourante(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return (fwd?.split(",")[0].trim() || h.get("x-real-ip") || "inconnue").slice(0, 64);
}

/** true si la requete est autorisee (et enregistree). false si le quota est depasse. */
function autoriser(ip: string): boolean {
  const maintenant = Date.now();
  const recentes = (seau.get(ip) ?? []).filter((t) => maintenant - t < FENETRE_MS);
  if (recentes.length >= MAX_TENTATIVES) {
    seau.set(ip, recentes);
    return false;
  }
  recentes.push(maintenant);
  seau.set(ip, recentes);
  return true;
}

const zToken = z.string().trim().min(1).max(128);
const zCode = z.string().trim().min(1).max(40);
const zHoneypot = z.string().max(200).optional();

// Vue publique renvoyee au client APRES verification du code (jamais avant).
export type FichePubliqueVue = {
  statut: "courrier_genere" | "soumis" | "valide";
  expiree: boolean;
  soumissionPossible: boolean;
  connues: DonneesConnues;
  soumises?: DonneesSoumises;
};

export type VerifierResultat =
  | { ok: true; vue: FichePubliqueVue }
  | { ok: false; message: string };

/** Verifie le code et renvoie l'etat de la fiche (rien tant que le code est faux). */
export async function verifierCodeAction(
  token: string,
  code: string,
  honeypot?: string,
): Promise<VerifierResultat> {
  const v = z.object({ token: zToken, code: zCode, honeypot: zHoneypot }).safeParse({ token, code, honeypot });
  if (!v.success) return { ok: false, message: "Code invalide." };
  if (v.data.honeypot && v.data.honeypot.length > 0) return { ok: false, message: "Code incorrect." }; // bot
  if (!autoriser(await ipCourante())) {
    return { ok: false, message: "Trop de tentatives. Reessayez dans quelques minutes." };
  }

  const nowISO = new Date().toISOString();
  const r = await consulterFiche(
    getFicheRenseignementsRepository(),
    hacher(v.data.token),
    v.data.code,
    nowISO,
  );
  if (!r.ok) return { ok: false, message: "Code incorrect." };

  return {
    ok: true,
    vue: {
      statut: r.statut,
      expiree: r.expiree,
      soumissionPossible: r.soumissionPossible,
      connues: r.connues,
      ...(r.soumises ? { soumises: r.soumises } : {}),
    },
  };
}

// Donnees du formulaire : email requis (raison d'etre), tout le reste optionnel. Zod strict.
const zDonnees = z.object({
  email: z.string().trim().email().max(320),
  telFixe: z.string().trim().max(30).optional(),
  telPortable: z.string().trim().max(30).optional(),
  adrNum: z.string().trim().max(20).optional(),
  adrVoie: z.string().trim().max(160).optional(),
  adrComplement: z.string().trim().max(160).optional(),
  adrCodePostal: z.string().trim().max(16).optional(),
  adrVille: z.string().trim().max(120).optional(),
  denomination: z.string().trim().max(160).optional(),
  formeJuridique: z.string().trim().max(60).optional(),
  mandataire: z.string().trim().max(200).optional(),
  secondNom: z.string().trim().max(160).optional(),
  secondTel: z.string().trim().max(30).optional(),
  secondEmail: z.string().trim().max(320).optional(),
  occupation: z.enum(["principale", "secondaire", "loue"]).optional(),
  occupantNom: z.string().trim().max(160).optional(),
  occupantTel: z.string().trim().max(30).optional(),
  occupantEmail: z.string().trim().max(320).optional(),
  gestionnaireNom: z.string().trim().max(160).optional(),
  gestionnaireAdresse: z.string().trim().max(200).optional(),
  gestionnaireContact: z.string().trim().max(200).optional(),
  gestionnaireRegleCharges: z.boolean().optional(),
  recevoirParCourriel: z.boolean().optional(),
  refuseLRE: z.boolean().optional(),
  prelevement: z.enum(["aucun", "trimestriel", "mensuel"]).optional(),
  consentPrestataires: z.boolean().optional(),
  consentActualites: z.boolean().optional(),
});

export type SoumettreActionResultat = { ok: true } | { ok: false; message: string };

/** Enregistre la reponse du coproprietaire (une seule fois). Re-verifie code + etat serveur. */
export async function soumettreFicheAction(
  token: string,
  code: string,
  donnees: unknown,
  honeypot?: string,
): Promise<SoumettreActionResultat> {
  const base = z.object({ token: zToken, code: zCode, honeypot: zHoneypot }).safeParse({ token, code, honeypot });
  if (!base.success) return { ok: false, message: "Requete invalide." };
  if (base.data.honeypot && base.data.honeypot.length > 0) return { ok: false, message: "Envoi refuse." };
  if (!autoriser(await ipCourante())) {
    return { ok: false, message: "Trop de tentatives. Reessayez dans quelques minutes." };
  }

  const d = zDonnees.safeParse(donnees);
  if (!d.success) return { ok: false, message: "Formulaire invalide : verifiez l'adresse email et les champs." };

  const nowISO = new Date().toISOString();
  const r = await soumettreFiche(
    getFicheRenseignementsRepository(),
    hacher(base.data.token),
    base.data.code,
    d.data as DonneesSoumises,
    nowISO,
  );
  if (r.ok) return { ok: true };
  const message =
    r.raison === "expiree"
      ? "Ce lien a expire. Contactez votre gestionnaire pour un nouveau courrier."
      : r.raison === "deja_soumis"
        ? "Cette fiche a deja ete transmise."
        : "Code incorrect.";
  return { ok: false, message };
}
