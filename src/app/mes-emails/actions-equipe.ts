"use server";

// Boîte d'équipe de l'écran E-mails (ADR-053, 29/10/2026) : attribution (« Je prends »,
// « Attribuer à… »), notes internes, en attente / de côté / relance. Fichier à part de
// actions.ts, comme « Comptabilité » et la bascule.
//
// Gardes : celles de « Pas pour moi » (gardes-boites.ts). Attribution et notes : boîte
// PARTAGÉE que la personne voit, mail distribué à l'un de ses binômes (ou en Comptabilité pour
// un comptable ; super-admin exempté). En attente : tout mail reçu que la personne voit, boîte
// perso comprise (boiteDuMail). Relance d'un envoi : boîte visible, et dans une boîte partagée
// un envoi dans une conversation de mes binômes. L'acteur vient TOUJOURS de la session.
// Les notes ne s'écrivent pas en incarnation (« Changer de gestionnaire ») : elles porteraient
// le nom de la personne incarnée.

import { z } from "zod";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
import { getGestionnaireCourant, incarnationEnCours } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import type { EtatEquipeMail, LigneHistoriqueAttribution, MembreEquipe, NoteInterne } from "@/lib/domain/boite-equipe";
import { oublierCompteurEmails } from "@/lib/services/mes-emails/compteur-emails";
import { conversationsDistribuees } from "@/lib/services/mes-emails/boites-visibles";
import {
  ajouterNoteMail,
  attribuerMail,
  attributairesDuMail,
  etatEquipeDesMails,
  historiqueAttributionMail,
  modifierNoteMail,
  notesDuMail,
  prendreMail,
  relancerSiPasDeReponse,
  reprendreMail,
  retirerAttributionMail,
  supprimerNoteMail,
  mettreEnAttente,
} from "@/lib/services/mes-emails/boite-equipe";
import { boiteCible, boiteDuMail, boitePartageeDe, boitesDe, natureBoite } from "./gardes-boites";

const zId = z.string().trim().min(1).max(600);
const zBoite = z.string().trim().min(1).max(320);
const zEmail = z.string().trim().min(3).max(320);
const zJour = z.object({ jour: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/) });
const zEcheance = z.union([z.enum(["demain", "3-jours", "semaine"]), zJour]);
const zChoixAttente = z.union([z.literal("de-cote"), zEcheance]);

const REFUS_PARTAGEE = "Seul un mail de la boîte partagée distribué à ton binôme peut être attribué ou annoté.";
const REFUS_MAIL = "Ce mail n'est pas dans tes boîtes.";

type Session = NonNullable<Awaited<ReturnType<typeof getGestionnaireCourant>>>;

/** La session et la boîte partagée du mail ; sinon le refus à rendre. */
async function partagee(emailId: string, boite: string): Promise<{ g: Session; boite: string } | { ok: false; erreur: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const b = await boitePartageeDe(g, boite, emailId);
  return b ? { g, boite: b } : echec(REFUS_PARTAGEE);
}

// --- Attribution -------------------------------------------------------------------------------

/** « Je prends ». */
export async function prendreMailAction(emailId: string, boite: string): Promise<Res<MembreEquipe>> {
  const v = z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    const donnees = await prendreMail(a.g, a.boite, v.data.emailId);
    oublierCompteurEmails(a.g.id);
    return { ok: true, donnees };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** « Attribuer à… » : un membre du binôme du mail (comptables pour la Comptabilité). */
export async function attribuerMailAction(emailId: string, boite: string, cibleEmail: string): Promise<Res<MembreEquipe>> {
  const v = z.object({ emailId: zId, boite: zBoite, cibleEmail: zEmail }).safeParse({ emailId, boite, cibleEmail });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    const donnees = await attribuerMail(a.g, a.boite, v.data.emailId, v.data.cibleEmail);
    oublierCompteurEmails(a.g.id);
    return { ok: true, donnees };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** Le mail redevient « non attribué ». */
export async function retirerAttributionAction(emailId: string, boite: string): Promise<Res> {
  const v = z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    await retirerAttributionMail(a.g, a.boite, v.data.emailId);
    oublierCompteurEmails(a.g.id);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** Les personnes proposées dans « Attribuer à… » pour ce mail. */
export async function attributairesAction(emailId: string, boite: string): Promise<Res<MembreEquipe[]>> {
  const v = z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    return { ok: true, donnees: await attributairesDuMail(a.boite, v.data.emailId) };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** Qui a attribué ce mail à qui, quand (20 derniers gestes). */
export async function historiqueAttributionAction(emailId: string, boite: string): Promise<Res<LigneHistoriqueAttribution[]>> {
  const v = z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    return { ok: true, donnees: await historiqueAttributionMail(a.boite, v.data.emailId) };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

// --- Notes internes ----------------------------------------------------------------------------

export async function notesDuMailAction(emailId: string, boite: string): Promise<Res<NoteInterne[]>> {
  const v = z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  try {
    return { ok: true, donnees: await notesDuMail(v.data.emailId) };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** Refus d'écrire une note en incarnation (elle porterait le nom de la personne incarnée). */
async function refusIncarnation(): Promise<{ ok: false; erreur: string } | null> {
  return (await incarnationEnCours()) ? echec("Les notes internes ne s'écrivent pas en incarnation.") : null;
}

export async function ajouterNoteAction(emailId: string, boite: string, texte: string): Promise<Res<NoteInterne>> {
  const v = z.object({ emailId: zId, boite: zBoite, texte: z.string().max(10_000) }).safeParse({ emailId, boite, texte });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  const refus = await refusIncarnation();
  if (refus) return refus;
  try {
    return { ok: true, donnees: await ajouterNoteMail(a.g, a.boite, v.data.emailId, v.data.texte) };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

export async function modifierNoteAction(emailId: string, boite: string, noteId: string, texte: string): Promise<Res> {
  const v = z.object({ emailId: zId, boite: zBoite, noteId: z.string().trim().min(1).max(64), texte: z.string().max(10_000) }).safeParse({ emailId, boite, noteId, texte });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  const refus = await refusIncarnation();
  if (refus) return refus;
  try {
    await modifierNoteMail(a.g, v.data.noteId, v.data.emailId, v.data.texte);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

export async function supprimerNoteAction(emailId: string, boite: string, noteId: string): Promise<Res> {
  const v = z.object({ emailId: zId, boite: zBoite, noteId: z.string().trim().min(1).max(64) }).safeParse({ emailId, boite, noteId });
  if (!v.success) return echec("Données invalides.");
  const a = await partagee(v.data.emailId, v.data.boite);
  if ("ok" in a) return a;
  const refus = await refusIncarnation();
  if (refus) return refus;
  try {
    await supprimerNoteMail(a.g, v.data.noteId, v.data.emailId);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

// --- En attente / de côté / relance -------------------------------------------------------------

/**
 * « En attente » d'un mail REÇU : « de-cote » (sans date), « demain », « 3-jours », « semaine »
 * ou { jour: "AAAA-MM-JJ" }. Rend la date de retour (null : de côté).
 */
export async function mettreEnAttenteAction(emailId: string, boite: string | undefined, choix: unknown): Promise<Res<{ jusquAu: string | null }>> {
  const v = z.object({ emailId: zId, boite: zBoite.optional(), choix: zChoixAttente }).safeParse({ emailId, boite, choix });
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const cible = await boiteDuMail(g, v.data.boite, v.data.emailId);
  if (!cible) return echec(REFUS_MAIL);
  try {
    const jusquAu = await mettreEnAttente(g, cible, v.data.emailId, v.data.choix);
    oublierCompteurEmails(g.id);
    return { ok: true, donnees: { jusquAu } };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/** « Reprendre » : lève l'attente, la mise de côté (mail reçu) ou la relance (mail envoyé). */
export async function reprendreMailAction(emailId: string, boite: string | undefined): Promise<Res> {
  const v = z.object({ emailId: zId, boite: zBoite.optional() }).safeParse({ emailId, boite });
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  // Un mail reçu : distribué à mon binôme. Un envoi relancé : la boîte suffit (la ligne n'existe
  // que si quelqu'un qui voyait l'envoi l'a posée ; la lever ne touche à aucun mail).
  const cible = (await boiteDuMail(g, v.data.boite, v.data.emailId)) ?? (await boiteCible(g, v.data.boite));
  if (!cible) return echec(REFUS_MAIL);
  try {
    await reprendreMail(cible, v.data.emailId);
    oublierCompteurEmails(g.id);
    return { ok: true };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

/**
 * « Relancer si pas de réponse dans… » sur un mail ENVOYÉ (liste des Envoyés : son
 * internetMessageId, sa conversation et sa date d'envoi). Rend la date de relance.
 */
export async function relancerSiPasDeReponseAction(input: unknown): Promise<Res<{ jusquAu: string }>> {
  const v = z
    .object({ emailId: zId, boite: zBoite, conversationId: z.string().trim().min(1).max(600), envoyeLe: z.string().trim().min(10).max(40), choix: zEcheance })
    .safeParse(input);
  if (!v.success) return echec("Données invalides.");
  const d = v.data;
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const cible = await boiteCible(g, d.boite);
  if (!cible) return echec(REFUS_MAIL);
  // Boîte partagée : un envoi dans une conversation de mes binômes (les Envoyés que je vois).
  if ((await natureBoite(g, cible)) === "partagee" && !estSuperAdmin(g.email) && !(await conversationsDistribuees(g, cible)).has(d.conversationId)) {
    return echec("Cet envoi n'est pas dans une conversation de ton binôme.");
  }
  try {
    const jusquAu = await relancerSiPasDeReponse(g, { boite: cible, internetMessageId: d.emailId, conversationId: d.conversationId, envoyeLe: d.envoyeLe, choix: d.choix });
    oublierCompteurEmails(g.id);
    return { ok: true, donnees: { jusquAu } };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}

// --- État agrégé --------------------------------------------------------------------------------

/**
 * L'état d'équipe des mails affichés (rafraîchissement côté client) : pastille, indicateur de
 * note, attente. Chaque mail avec SA boîte (l'onglet Comptabilité mêle plusieurs boîtes). Un
 * mail d'une boîte que je ne vois pas, ou d'une boîte partagée sans être distribué à mon
 * binôme, est ignoré. Côté serveur (page), appeler directement etatEquipeDesMails.
 */
export async function etatEquipeAction(mails: unknown): Promise<Res<{ actif: boolean; etats: EtatEquipeMail[] }>> {
  const v = z.array(z.object({ emailId: zId, boite: zBoite })).max(500).safeParse(mails);
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const boites = await boitesDe(g);
  const retenus: { internetMessageId: string; boite: string }[] = [];
  for (const m of v.data) {
    const b = boites.find((x) => x.id === m.boite.trim().toLowerCase());
    if (b && (b.personnelle || (await boitePartageeDe(g, b.id, m.emailId)))) retenus.push({ internetMessageId: m.emailId, boite: b.id });
  }
  try {
    const r = await etatEquipeDesMails(retenus, { lecteur: g });
    return { ok: true, donnees: { actif: r.actif, etats: [...r.parMail.values()] } };
  } catch (e) {
    return echecDepuis(e, "mes-emails-equipe");
  }
}
