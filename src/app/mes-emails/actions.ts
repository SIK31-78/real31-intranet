"use server";

// Server actions du cockpit "Mes emails". Chaque action : (1) VALIDE ses entrees (zod)
// car une Server Action est un endpoint POST public ; (2) resout le gestionnaire +
// verifie le cloisonnement via withGestionnaire (defense en profondeur, on ne se repose
// pas que sur l'UI) ; (3) ecrit puis revalide. L'identite vient du serveur, jamais du client.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import {
  enregistrerBrouillon,
  enregistrerCopro,
  enregistrerDossier,
  enregistrerEtapes,
  enregistrerLu,
  enregistrerRattachement,
  enregistrerStatut,
  type Cible,
} from "@/lib/services/mes-emails/maj-etat";
import type { Rattachement } from "@/lib/domain/mes-emails";
import { synchroniserMesEmails } from "@/lib/services/mes-emails/synchroniser";
import { creerBrouillonOutlook } from "@/lib/services/mes-emails/creer-brouillon";
import { classerDansDossier, listerDossiersBoite } from "@/lib/services/mes-emails/classer";
import { genererBrouillonMail } from "@/lib/services/mes-emails/generer-brouillon";
import { listerPiecesJointesMail, lirePieceJointeMail } from "@/lib/services/mes-emails/pieces-jointes";
import { envoyerReponseMail } from "@/lib/services/mes-emails/envoyer-reponse";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { getDossiersCopro } from "@/lib/services/dossiers/get-dossiers";
import { rattacherEmailAuDossier, creerDossierDepuisMail } from "@/lib/services/dossiers/rattacher-email";
import type { DossierBoite } from "@/lib/domain/mes-emails";
import { TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";

// --- Cloisonnement -----------------------------------------------------------
// En mode boite REELLE (MAIL_SOURCE=graph), le cockpit lit la PROPRE boite du gestionnaire :
// chaque mail lui appartient, quelle que soit la copro qu'il concerne -> le cloisonnement
// copro n'a pas de sens et bloquerait a tort. On ne le verifie que dans le REPLI archive.
function cloisonnementCoproRequis(): boolean {
  return process.env.COPRO_SOURCE === "supabase" && process.env.MAIL_SOURCE !== "graph";
}
// Les dossiers intranet, eux, sont TOUJOURS copro-scopes (perimetre du gestionnaire).
function dossierIntranetCloisonne(): boolean {
  return process.env.COPRO_SOURCE === "supabase";
}

type Auth = { ok: true; g: Gestionnaire } | { ok: false; message: string };

// Resout le gestionnaire courant + (si demande) verifie que la copro est dans son
// portefeuille. Point unique d'auth + perimetre pour toutes les actions (audit E1).
async function withGestionnaire(coproCode: string, verifierPerimetre: boolean): Promise<Auth> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (verifierPerimetre && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  return { ok: true, g };
}

// --- Validation (zod) : endpoints POST publics -> on borne tout (format, longueur, enum) -
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zId = z.string().trim().min(1).max(600); // internetMessageId / id Graph
const zCopro = z.string().trim().max(40); // code copro (peut etre vide = retrait)
const zCourt = z.string().max(2000); // sujet, nom, titre, resume, nom de dossier
const zCorps = z.string().max(100_000); // corps de mail / brouillon
const zEmails = z.array(z.string().trim().max(320)).max(50);
const zIds = z.array(z.string().max(600)).max(50);
const zEtapes = z.array(z.number().int()).max(200);

/** Construit la Cible d'ecriture d'etat depuis un gestionnaire valide. */
function cibleDe(g: Gestionnaire, emailId: string, coproCode: string): Cible {
  return { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) };
}

// --- Actions d'etat (retour void : sur entree/auth invalide, on ne fait rien) -----------

export async function devaliderMailAction(emailId: string, coproCode: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerStatut(cibleDe(auth.g, emailId, coproCode), "nouveau", []);
  revalidatePath("/mes-emails");
}

export async function toggleEtapeAction(emailId: string, coproCode: string, etapes: number[]): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, etapes: zEtapes }).safeParse({ emailId, coproCode, etapes }).success)
    return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerEtapes(cibleDe(auth.g, emailId, coproCode), etapes);
  revalidatePath("/mes-emails");
}

export async function editBrouillonAction(emailId: string, coproCode: string, brouillon: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, brouillon: zCorps }).safeParse({ emailId, coproCode, brouillon }).success)
    return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerBrouillon(cibleDe(auth.g, emailId, coproCode), brouillon);
  revalidatePath("/mes-emails");
}

export async function rattachementAction(
  emailId: string,
  coproCode: string,
  rattachement: Rattachement,
): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerRattachement(cibleDe(auth.g, emailId, coproCode), rattachement);
  revalidatePath("/mes-emails");
}

export async function marquerLuAction(emailId: string, coproCode: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerLu(cibleDe(auth.g, emailId, coproCode));
}

// --- Pont vers le module Dossiers (intranet_dossiers, TOUJOURS copro-scope) --------------

export async function chargerDossiersCoproAction(
  coproCode: string,
): Promise<{ id: string; titre: string; type: TypeDossier }[]> {
  if (!zCopro.safeParse(coproCode).success || !coproCode) return [];
  const auth = await withGestionnaire(coproCode, dossierIntranetCloisonne());
  if (!auth.ok) return [];
  const dossiers = await getDossiersCopro(coproCode, auth.g.id);
  return dossiers.map((d) => ({ id: d.id, titre: d.titre, type: d.type }));
}

export async function rattacherADossierAction(
  emailId: string,
  coproCode: string,
  dossierId: string,
  dossierTitre: string,
  resume: string,
): Promise<{ ok: boolean; message?: string }> {
  const v = z
    .object({ emailId: zId, coproCode: zCopro, dossierId: zId, dossierTitre: zCourt, resume: zCourt })
    .safeParse({ emailId, coproCode, dossierId, dossierTitre, resume });
  if (!v.success) return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, dossierIntranetCloisonne());
  if (!auth.ok) return auth;
  const g = auth.g;
  const ok = await rattacherEmailAuDossier(dossierId, g.id, g.initiales, resume, emailId);
  if (!ok) return { ok: false, message: "Dossier introuvable ou hors périmètre." };
  await enregistrerRattachement(cibleDe(g, emailId, coproCode), {
    statut: "existant",
    dossierId,
    dossierLabel: dossierTitre,
    intranet: true,
  });
  revalidatePath("/mes-emails");
  return { ok: true };
}

export async function creerDossierDepuisMailAction(
  emailId: string,
  coproCode: string,
  type: TypeDossier,
  titre: string,
  resume: string,
): Promise<{ ok: boolean; dossierId?: string; message?: string }> {
  const v = z
    .object({
      emailId: zId,
      coproCode: zCopro,
      type: z.enum(TYPE_DOSSIER_ORDRE as [TypeDossier, ...TypeDossier[]]),
      titre: zCourt,
      resume: zCourt,
    })
    .safeParse({ emailId, coproCode, type, titre, resume });
  if (!v.success) return { ok: false, message: "Données invalides." };
  if (!titre.trim()) return { ok: false, message: "Donne un titre au dossier." };
  const auth = await withGestionnaire(coproCode, dossierIntranetCloisonne());
  if (!auth.ok) return auth;
  const g = auth.g;
  const id = await creerDossierDepuisMail(coproCode, g.id, g.initiales, type, titre.trim(), resume, emailId);
  if (!id) return { ok: false, message: "Création impossible (hors périmètre)." };
  await enregistrerRattachement(cibleDe(g, emailId, coproCode), {
    statut: "existant",
    dossierId: id,
    dossierLabel: titre.trim(),
    intranet: true,
  });
  revalidatePath("/mes-emails");
  return { ok: true, dossierId: id };
}

// --- Synchro -----------------------------------------------------------------

export async function synchroniserAction(): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  // Grise en prod tant que la boite n'est pas branchee, et reserve aux pilotes
  // (MAIL_PILOTES) : un POST direct d'un non-pilote est refuse ici aussi.
  if (!mailModuleActifPour(g.email)) return;
  await synchroniserMesEmails(g);
  revalidatePath("/mes-emails");
}

// --- Pieces jointes (boite propre du connecte) -------------------------------

export async function chargerPiecesJointesAction(
  emailId: string,
  coproCode: string,
): Promise<PieceJointeRef[]> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success) return [];
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok || !auth.g.email) return [];
  try {
    return await listerPiecesJointesMail(auth.g.email, emailId);
  } catch (e) {
    console.warn("[mes-emails] pieces jointes indisponibles :", (e as Error).message);
    return [];
  }
}

export async function telechargerPieceJointeAction(
  emailId: string,
  coproCode: string,
  attachmentId: string,
): Promise<{ ok: boolean; nom?: string; type?: string; base64?: string; message?: string }> {
  if (!z.object({ emailId: zId, coproCode: zCopro, attachmentId: zId }).safeParse({ emailId, coproCode, attachmentId }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  if (!auth.g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  try {
    const pj = await lirePieceJointeMail(auth.g.email, emailId, attachmentId);
    return { ok: true, ...pj };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Brouillon IA a la demande -----------------------------------------------

export async function genererBrouillonAction(
  emailId: string,
  coproCode: string,
): Promise<{ ok: boolean; brouillon?: string; message?: string }> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const g = auth.g;
  try {
    const reponse = await genererBrouillonMail(g.id, emailId);
    if (reponse === null) return { ok: false, message: "Mail introuvable." };
    if (reponse) await enregistrerBrouillon(cibleDe(g, emailId, coproCode), reponse);
    revalidatePath("/mes-emails");
    return { ok: true, brouillon: reponse };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- ENVOI REEL de la reponse (irreversible) ---------------------------------

export async function envoyerReponseAction(
  emailId: string,
  coproCode: string,
  corps: string,
  sujet: string,
  a: string[],
  cc: string[],
  cci: string[],
  pjIds: string[],
): Promise<{ ok: boolean; message?: string }> {
  const v = z
    .object({
      emailId: zId,
      coproCode: zCopro,
      corps: zCorps,
      sujet: zCourt,
      a: zEmails,
      cc: zEmails,
      cci: zEmails,
      pjIds: zIds,
    })
    .safeParse({ emailId, coproCode, corps, sujet, a, cc, cci, pjIds });
  if (!v.success) return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const g = auth.g;
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  if (!corps.trim()) return { ok: false, message: "Le message est vide." };
  // Destinataires : adresses bien formees, au moins une en "A", plafond global (anti-spam).
  const tous = [...a, ...cc, ...cci].map((x) => x.trim()).filter(Boolean);
  if (a.filter((x) => EMAIL_RE.test(x.trim())).length === 0) {
    return { ok: false, message: "Ajoute au moins un destinataire valide en 'À'." };
  }
  const invalide = tous.find((x) => !EMAIL_RE.test(x));
  if (invalide) return { ok: false, message: `Adresse invalide : ${invalide}` };
  if (tous.length > 50) return { ok: false, message: "Trop de destinataires (50 maximum)." };
  try {
    // Signature recuperee cote serveur (Signitic) et injectee : un envoi app-only ne passe
    // pas par l'add-in Outlook qui l'ajoute d'habitude.
    const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
    await envoyerReponseMail({ boite: g.email, internetMessageId: emailId, corps, sujet, a, cc, cci, signatureHtml, pjIds });
    revalidatePath("/mes-emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Attribution copro (a la main, ou retrait si vide) -----------------------

export async function rattacherCoproAction(
  emailId: string,
  coproCode: string,
  coproNom: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!z.object({ emailId: zId, coproCode: zCopro, coproNom: zCourt }).safeParse({ emailId, coproCode, coproNom }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  try {
    await enregistrerCopro(cibleDe(auth.g, emailId, coproCode), coproNom);
    revalidatePath("/mes-emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Dossiers Outlook + classement (boite propre) ----------------------------

export async function chargerDossiersAction(): Promise<DossierBoite[]> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return [];
  try {
    return await listerDossiersBoite(g.email);
  } catch (e) {
    console.warn("[mes-emails] liste dossiers Outlook KO :", (e as Error).message);
    return [];
  }
}

export async function classerDansDossierAction(
  emailId: string,
  coproCode: string,
  folderId: string,
  folderNom: string,
  etapes: number[],
  brouillon: string,
): Promise<{ ok: boolean; message?: string }> {
  const v = z
    .object({ emailId: zId, coproCode: zCopro, folderId: zId, folderNom: zCourt, etapes: zEtapes, brouillon: zCorps })
    .safeParse({ emailId, coproCode, folderId, folderNom, etapes, brouillon });
  if (!v.success) return { ok: false, message: "Données invalides." };
  if (!folderId) return { ok: false, message: "Choisis un dossier de destination." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const g = auth.g;
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  try {
    const res = await classerDansDossier(g.email, emailId, folderId);
    const c = cibleDe(g, emailId, coproCode);
    await enregistrerStatut(c, "classe", etapes, brouillon);
    await enregistrerDossier(c, folderId, folderNom);
    revalidatePath("/mes-emails");
    return res.deplace ? { ok: true } : { ok: false, message: "Le mail n'a pas pu être déplacé." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function creerBrouillonAction(
  emailId: string,
  coproCode: string,
  corps: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!z.object({ emailId: zId, coproCode: zCopro, corps: zCorps }).safeParse({ emailId, coproCode, corps }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  try {
    await creerBrouillonOutlook(auth.g, emailId, corps);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
