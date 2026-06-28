"use server";

// Server actions du cockpit "Mes emails" : persistance de ce que le gestionnaire
// fait sur un mail. Chaque action verifie le cloisonnement (la copro du mail
// appartient bien au gestionnaire courant) avant d'ecrire, puis revalide la page.
// L'identite (gid, initiales) vient du serveur, jamais du client.

import { revalidatePath } from "next/cache";
import { getGestionnaireCourant, mailModuleActif } from "@/lib/auth/session";
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
import type { TypeDossier } from "@/lib/domain/dossier";

// En mode boite REELLE (MAIL_SOURCE=graph), le cockpit lit la PROPRE boite du
// gestionnaire connecte : chaque mail lui appartient deja, quelle que soit la copro
// qu'il concerne (il peut recevoir un mail sur une copro qu'il ne gere pas). Le
// cloisonnement par copro n'a alors pas de sens et bloquerait a tort. On ne verifie
// l'appartenance copro que dans le REPLI archive (donnees multi-gestionnaires partagees).
function cloisonnementCoproRequis(): boolean {
  return process.env.COPRO_SOURCE === "supabase" && process.env.MAIL_SOURCE !== "graph";
}

async function cible(emailId: string, coproCode: string): Promise<Cible | null> {
  const g = await getGestionnaireCourant();
  if (!g) return null;
  // Cloisonnement copro seulement en repli archive (cf. cloisonnementCoproRequis).
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return null;
  }
  return { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) };
}

export async function devaliderMailAction(emailId: string, coproCode: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerStatut(c, "nouveau", []);
  revalidatePath("/mes-emails");
}

export async function toggleEtapeAction(emailId: string, coproCode: string, etapes: number[]): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerEtapes(c, etapes);
  revalidatePath("/mes-emails");
}

export async function editBrouillonAction(emailId: string, coproCode: string, brouillon: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerBrouillon(c, brouillon);
  revalidatePath("/mes-emails");
}

export async function rattachementAction(
  emailId: string,
  coproCode: string,
  rattachement: Rattachement,
): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerRattachement(c, rattachement);
  revalidatePath("/mes-emails");
}

// --- Pont vers le module Dossiers (intranet_dossiers) ---------------------

/** Dossiers REELS de la copro (pour le selecteur de rattachement du cockpit). */
export async function chargerDossiersCoproAction(
  coproCode: string,
): Promise<{ id: string; titre: string; type: TypeDossier }[]> {
  const g = await getGestionnaireCourant();
  if (!g || !coproCode) return [];
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) return [];
  const dossiers = await getDossiersCopro(coproCode, g.id);
  return dossiers.map((d) => ({ id: d.id, titre: d.titre, type: d.type }));
}

/** Rattache le mail a un dossier REEL existant : ajoute l'email a son journal + memorise
 *  le rattachement cote mail. */
export async function rattacherADossierAction(
  emailId: string,
  coproCode: string,
  dossierId: string,
  dossierTitre: string,
  resume: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  const ok = await rattacherEmailAuDossier(dossierId, g.id, g.initiales, resume, emailId);
  if (!ok) return { ok: false, message: "Dossier introuvable ou hors périmètre." };
  await enregistrerRattachement(
    { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) },
    { statut: "existant", dossierId, dossierLabel: dossierTitre, intranet: true },
  );
  revalidatePath("/mes-emails");
  return { ok: true };
}

/** Cree un dossier REEL depuis le mail (type + titre) et y rattache l'email. */
export async function creerDossierDepuisMailAction(
  emailId: string,
  coproCode: string,
  type: TypeDossier,
  titre: string,
  resume: string,
): Promise<{ ok: boolean; dossierId?: string; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (!titre.trim()) return { ok: false, message: "Donne un titre au dossier." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  const id = await creerDossierDepuisMail(coproCode, g.id, g.initiales, type, titre.trim(), resume, emailId);
  if (!id) return { ok: false, message: "Création impossible (hors périmètre)." };
  await enregistrerRattachement(
    { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) },
    { statut: "existant", dossierId: id, dossierLabel: titre.trim(), intranet: true },
  );
  revalidatePath("/mes-emails");
  return { ok: true, dossierId: id };
}

export async function marquerLuAction(emailId: string, coproCode: string): Promise<void> {
  const c = await cible(emailId, coproCode);
  if (!c) return;
  await enregistrerLu(c);
}

// Synchronise la boite du gestionnaire connecte : ingestion -> pipeline -> cache du
// triage. L'identite vient du serveur ; en delegue, l'adapter lit la boite du
// connecte (cloisonnement intrinseque).
export async function synchroniserAction(): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  // Module grise en prod : pas de synchro tant que la boite n'est pas branchee.
  if (!mailModuleActif()) return;
  await synchroniserMesEmails(g);
  revalidatePath("/mes-emails");
}

// Liste les pieces jointes REELLES du mail (a l'ouverture, lazy). Boite = celle du
// gestionnaire connecte -> cloisonnement intrinseque. Degrade en [] si Graph indispo.
export async function chargerPiecesJointesAction(
  emailId: string,
  coproCode: string,
): Promise<PieceJointeRef[]> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return [];
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) return [];
  try {
    return await listerPiecesJointesMail(g.email, emailId);
  } catch (e) {
    console.warn("[mes-emails] pieces jointes indisponibles :", (e as Error).message);
    return [];
  }
}

// Recupere le contenu d'une piece jointe (base64) pour telechargement cote client.
export async function telechargerPieceJointeAction(
  emailId: string,
  coproCode: string,
  attachmentId: string,
): Promise<{ ok: boolean; nom?: string; type?: string; base64?: string; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    const pj = await lirePieceJointeMail(g.email, emailId, attachmentId);
    return { ok: true, ...pj };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Genere le brouillon de reponse A LA DEMANDE (quand le gestionnaire ouvre/traite un
// mail), au lieu de le produire pour tous les mails au sync. Persiste le brouillon
// genere (etat) et le renvoie pour affichage immediat.
export async function genererBrouillonAction(
  emailId: string,
  coproCode: string,
): Promise<{ ok: boolean; brouillon?: string; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    const reponse = await genererBrouillonMail(g.id, emailId);
    if (reponse === null) return { ok: false, message: "Mail introuvable." };
    if (reponse) {
      await enregistrerBrouillon(
        { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) },
        reponse,
      );
    }
    revalidatePath("/mes-emails");
    return { ok: true, brouillon: reponse };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// ENVOIE la reponse (vrai mail, irreversible) avec les destinataires choisis. L'UI
// confirme avant d'appeler. L'envoi reel n'a lieu qu'en MAIL_SOURCE=graph.
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
  const g = await getGestionnaireCourant();
  if (!g?.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  if (!corps.trim()) return { ok: false, message: "Le message est vide." };
  if (a.filter((x) => x.includes("@")).length === 0) {
    return { ok: false, message: "Ajoute au moins un destinataire en 'À'." };
  }
  try {
    // Signature recuperee cote serveur (Signitic) et injectee dans le corps : un envoi
    // app-only ne passe pas par l'add-in Outlook qui l'ajoute d'habitude.
    const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
    await envoyerReponseMail({
      boite: g.email,
      internetMessageId: emailId,
      corps,
      sujet,
      a,
      cc,
      cci,
      signatureHtml,
      pjIds,
    });
    revalidatePath("/mes-emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Rattache un mail a une copropriete A LA MAIN, ou la RETIRE (coproCode vide).
// Le cloisonnement porte sur la copro CHOISIE (elle doit etre dans le portefeuille) ;
// le retrait (vide) est toujours autorise (la copro n'est pas obligatoire).
export async function rattacherCoproAction(
  emailId: string,
  coproCode: string,
  coproNom: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Cette copropriété n'est pas dans ton périmètre." };
  }
  try {
    await enregistrerCopro(
      { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) },
      coproNom,
    );
    revalidatePath("/mes-emails");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Liste les vrais dossiers de la boite du gestionnaire connecte (racine + sous-Inbox),
// pour le selecteur de classement du cockpit. Boite = celle du connecte (g.email) ->
// cloisonnement intrinseque. Degrade en liste vide si Graph indisponible.
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

// Classe un mail dans un dossier Outlook CHOISI (par son id) et marque le mail traite.
// Bloque si aucun dossier n'est choisi (plus de mail "classe" qui ne part nulle part).
// La destination etant un dossier de la boite du connecte, le cloisonnement est
// intrinseque ; si une copro est associee, on la verifie en defense en profondeur.
// `coproCode` est passe tel quel a l'etat pour NE PAS ecraser le rattachement existant.
export async function classerDansDossierAction(
  emailId: string,
  coproCode: string,
  folderId: string,
  folderNom: string,
  etapes: number[],
  brouillon: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (!folderId) return { ok: false, message: "Choisis un dossier de destination." };
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    const res = await classerDansDossier(g.email, emailId, folderId);
    const c: Cible = { gid: g.id, emailId, coproCode, initiales: g.initiales, email: g.email };
    await enregistrerStatut(c, "classe", etapes, brouillon);
    // Memorise le dossier choisi (reaffichage + presélection au reload).
    await enregistrerDossier(c, folderId, folderNom);
    revalidatePath("/mes-emails");
    return res.deplace ? { ok: true } : { ok: false, message: "Le mail n'a pas pu être déplacé." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// Cree un brouillon de reponse dans la boite Outlook du gestionnaire (Graph
// createReply). Renvoie un resultat pour que le cockpit affiche succes/erreur.
export async function creerBrouillonAction(
  emailId: string,
  coproCode: string,
  corps: string,
): Promise<{ ok: boolean; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Non connecté." };
  if (cloisonnementCoproRequis() && coproCode && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de ton périmètre." };
  }
  try {
    await creerBrouillonOutlook(g, emailId, corps);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
