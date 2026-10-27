// Service de l'écran « Échanges » (REA-15) : chercher un mail reçu ou envoyé dans les boîtes
// que l'utilisateur a le droit de lire, et ouvrir ce qu'on trouve. LECTURE SEULE.
// Chaque entrée vérifie la boîte demandée contre les droits (domaine : boiteAutorisee) :
// l'écran ne peut pas servir à lire la boîte d'un collègue en trafiquant l'URL.

import {
  boiteAutorisee,
  BoiteNonLisible,
  boitesVisibles,
  codesDeCopro,
  fusionnerResultats,
  lireBoitesParAgence,
  refEchange,
  requetesKql,
  resumeEchange,
  type BoiteVisible,
  type CritereEchanges,
  type EchangeTrouve,
  type Utilisateur,
} from "@/lib/domain/echanges";
import { cleDeReference, type CoproTri } from "@/lib/domain/tri-emails";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import type { Dossier } from "@/lib/domain/dossier";
import { getDossiersCopro } from "@/lib/services/dossiers/get-dossiers";
import { rattacherEmailAuDossier } from "@/lib/services/dossiers/rattacher-email";
import { boitesParAgenceBrut, boitesTri } from "@/lib/domain/mail-gate";
import { getAgenceRepository, getMailboxProvider, getRechercheMail, getReferentielTriProvider } from "@/lib/adapters/router";

/** Par requête et par boîte : de quoi couvrir des années pour une copro, sans noyer l'écran. */
const MAX_PAR_REQUETE = 150;
const MAX_AFFICHES = 300;

export class AccesRefuse extends Error {}

// Les 4 agences changent rarement ; la barre latérale demande l'agence à chaque page.
const TTL_AGENCES_MS = 10 * 60 * 1000;
let agencesCache: { valeur: { id: string; code: string }[]; expire: number } | null = null;

async function agences() {
  if (agencesCache && Date.now() < agencesCache.expire) return agencesCache.valeur;
  const valeur = await getAgenceRepository().listerAgences().catch(() => []);
  agencesCache = { valeur, expire: Date.now() + TTL_AGENCES_MS };
  return valeur;
}

/** L'utilisateur tel que l'écran le voit : son agence en code lisible. */
export async function utilisateurEchanges(
  g: { email?: string; agencyId?: string },
  superAdmin: boolean,
  incarne = false,
): Promise<Utilisateur | null> {
  if (!g.email) return null;
  // Rien de configuré : pas d'écran, inutile d'interroger la base.
  if (!boitesParAgenceBrut().trim()) return { email: g.email.toLowerCase(), agence: null, superAdmin, incarne };
  const agence = g.agencyId ? ((await agences()).find((a) => a.id === g.agencyId)?.code.toUpperCase() ?? null) : null;
  return { email: g.email.toLowerCase(), agence, superAdmin, incarne };
}

const parAgence = () => lireBoitesParAgence(boitesParAgenceBrut());

export function boitesDe(u: Utilisateur): BoiteVisible[] {
  return boitesVisibles(u, parAgence());
}

export function echangesOuverts(u: Utilisateur | null): boolean {
  return u !== null && boitesDe(u).length > 0;
}

function garder(u: Utilisateur, boite: string): string {
  const b = boite.trim().toLowerCase();
  if (!boiteAutorisee(b, u, parAgence())) throw new AccesRefuse(`Accès refusé à la boîte ${b}.`);
  return b;
}

/**
 * Les agences dont on cherche les copros (27/10/2026) : celle de l'utilisateur ; pour un
 * super-admin, toutes celles qui ont une boîte (écran Échanges ou tri). Jamais tout le parc.
 */
function agencesEchanges(u: Utilisateur): string[] {
  if (!u.superAdmin) return u.agence ? [u.agence] : [];
  return [...new Set([...Object.keys(parAgence()), ...boitesTri().flatMap((b) => b.agences)])];
}

/** Les copros proposées dans la recherche : celles du référentiel du tri, pour les agences de l'utilisateur. */
export async function coprosEchanges(u: Utilisateur): Promise<Pick<CoproTri, "reference" | "nom" | "source">[]> {
  const ref = await getReferentielTriProvider(agencesEchanges(u)).charger();
  return ref.copros.map((c) => ({ reference: c.reference, nom: c.nom, ...(c.source ? { source: c.source } : {}) })).sort((a, b) => a.reference.localeCompare(b.reference));
}

export interface ResultatRecherche {
  echanges: EchangeTrouve[];
  /** Boîtes qui n'ont pas répondu, avec la raison lisible. */
  erreurs: string[];
  /** Pour une recherche par copro : combien d'adresses connues ont servi. */
  adressesCopro: number | null;
  /** true si la limite d'affichage est atteinte : il faut affiner. */
  tronque: boolean;
}

export async function rechercherEchanges(u: Utilisateur, critere: CritereEchanges, boites: string[]): Promise<ResultatRecherche> {
  const cibles = [...new Set(boites.map((b) => garder(u, b)))];
  let adresses: string[] = [];
  let codes: string[] = [];
  if (critere.copro) {
    const cle = cleDeReference(critere.copro);
    const ref = await getReferentielTriProvider(agencesEchanges(u)).charger().catch(() => null);
    codes = codesDeCopro(critere.copro);
    if (ref && cle) {
      for (const [email, liens] of Object.entries(ref.expediteurs)) {
        if (liens.some((l) => cleDeReference(l.reference) === cle)) adresses.push(email);
      }
    }
    adresses = [...new Set(adresses)];
  }
  const requetes = requetesKql(critere, adresses, codes);
  if (requetes.length === 0 || cibles.length === 0) return { echanges: [], erreurs: [], adressesCopro: null, tronque: false };

  const moteur = getRechercheMail();
  const erreurs: string[] = [];
  const listes = await Promise.all(
    cibles.flatMap((boite) =>
      requetes.map((kql) =>
        moteur.rechercher({ boite, kql, max: MAX_PAR_REQUETE }).catch((e: unknown) => {
          const msg =
            e instanceof BoiteNonLisible
              ? `La boîte ${boite} n'est pas encore lisible par l'intranet (à ajouter au groupe autorisé par la DSI).`
              : `La recherche dans ${boite} n'a pas abouti.`;
          if (!erreurs.includes(msg)) erreurs.push(msg);
          if (!(e instanceof BoiteNonLisible)) console.error("[echanges] recherche :", e instanceof Error ? e.message : e);
          return [] as EchangeTrouve[];
        }),
      ),
    ),
  );
  const echanges = fusionnerResultats(listes, MAX_AFFICHES);
  return {
    echanges,
    erreurs,
    adressesCopro: critere.copro ? adresses.length : null,
    tronque: listes.flat().length > MAX_AFFICHES || listes.some((l) => l.length >= MAX_PAR_REQUETE),
  };
}

export async function lireEchange(u: Utilisateur, boite: string, id: string): Promise<string> {
  return getRechercheMail().lireCorps({ boite: garder(u, boite), id });
}

export async function listerPiecesJointesEchange(u: Utilisateur, boite: string, internetMessageId: string): Promise<PieceJointeRef[]> {
  return getMailboxProvider().listerPiecesJointes({ boite: garder(u, boite), internetMessageId });
}

export async function lirePieceJointeEchange(
  u: Utilisateur,
  boite: string,
  internetMessageId: string,
  attachmentId: string,
): Promise<{ nom: string; type: string; base64: string }> {
  return getMailboxProvider().lirePieceJointe({ boite: garder(u, boite), internetMessageId, attachmentId });
}

/** Un mail précis (lien depuis un dossier), dans une boîte qu'on a le droit de lire. */
export async function trouverEchange(u: Utilisateur, boite: string, internetMessageId: string): Promise<EchangeTrouve | null> {
  return getRechercheMail().trouver({ boite: garder(u, boite), internetMessageId });
}

/** Dossiers ouverts de la copro, auxquels rattacher un mail (cloisonnement du module Dossiers). */
export async function dossiersPourRattacher(managerId: string, coproRef: string): Promise<Pick<Dossier, "id" | "titre" | "type" | "statut" | "coproCode">[]> {
  // Les dossiers portent le code Crypto (S300) ou ESTALE (S0300) : on cherche les deux.
  const listes = await Promise.all(codesDeCopro(coproRef).map((code) => getDossiersCopro(code, managerId).catch(() => [])));
  return listes
    .flat()
    .filter((d) => d.statut !== "clos")
    .map((d) => ({ id: d.id, titre: d.titre, type: d.type, statut: d.statut, coproCode: d.coproCode }));
}

/**
 * Rattache un mail au journal d'un dossier, à la date du mail. Le résumé est relu dans la
 * boîte, jamais pris du navigateur. false si le dossier est hors du périmètre.
 */
export async function rattacherEchange(
  u: Utilisateur,
  g: { id: string; initiales: string },
  dossierId: string,
  boite: string,
  internetMessageId: string,
): Promise<boolean> {
  const e = await trouverEchange(u, boite, internetMessageId);
  if (!e) throw new Error("Ce mail n'est plus dans la boîte.");
  return rattacherEmailAuDossier(dossierId, g.id, g.initiales, resumeEchange(e), refEchange(e.boite, e.internetMessageId), e.date);
}
