"use server";

// Server actions du cockpit "Mes emails". Chaque action : (1) VALIDE ses entrees (zod)
// car une Server Action est un endpoint POST public ; (2) resout le gestionnaire +
// verifie le cloisonnement via withGestionnaire (defense en profondeur, on ne se repose
// pas que sur l'UI) ; (3) ecrit puis revalide. L'identite vient du serveur, jamais du client.

import { revalidatePath } from "next/cache";
import { echec, echecDepuis, type Res } from "@/lib/actions/resultat";
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
import { boiteAutorisee } from "@/lib/domain/boites-mail";
import { envoiMailActif } from "@/lib/domain/mail-gate";
import { boitesVisibles } from "@/lib/services/mes-emails/boites-visibles";
import { reporterCoproAuTri } from "@/lib/services/mes-emails/reporter-copro-tri";
import { creerBrouillonReponse } from "@/lib/services/mes-emails/creer-brouillon";
import { classerDansDossier, creerDossierBoite, listerDossiersBoite } from "@/lib/services/mes-emails/classer";
import { genererBrouillonMail } from "@/lib/services/mes-emails/generer-brouillon";
import { listerImagesMail, listerPiecesJointesMail, lirePieceJointeMail } from "@/lib/services/mes-emails/pieces-jointes";
import { reponsesEnvoyees } from "@/lib/services/mes-emails/reponses-envoyees";
import { historiqueDuMail } from "@/lib/services/mes-emails/historique-mail";
import { coprosPourReaffecter, envoyerABonneCopro } from "@/lib/services/tri-emails/reaffecter";
import type { CoproDestination } from "@/lib/domain/recherche-copro-tolerante";
import type { ReponseEnvoyee } from "@/lib/domain/echanges";
import { deposerPieceJointe } from "@/lib/services/mes-emails/deposer-piece-jointe";
import { transmettreFacture } from "@/lib/services/mes-emails/transmettre-facture";
import { envoyerReponseMail } from "@/lib/services/mes-emails/envoyer-reponse";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import type { ContexteCopro, PieceJointeRef } from "@/lib/domain/mes-emails";
import { contexteCoproPour } from "@/lib/services/mes-emails/get-mes-emails";
import { getDossiersCopro } from "@/lib/services/dossiers/get-dossiers";
import { rattacherEmailAuDossier, creerDossierDepuisMail } from "@/lib/services/dossiers/rattacher-email";
import type { DossierBoite } from "@/lib/domain/mes-emails";
import { TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";

// --- Boites ------------------------------------------------------------------
// L'adresse de boite arrive du CLIENT (le mail affiche, le "De :" choisi). Elle n'est
// JAMAIS crue sur parole : seule une boite de la configuration visible est acceptee.
// Absente => boite personnelle, c'est-a-dire le comportement d'avant le multi-boites.

const zBoite = z.string().max(320).optional();

async function boiteCible(g: { email?: string }, demandee: string | undefined): Promise<string | null> {
  const boites = await boitesVisibles(g);
  const cible =
    (demandee ?? "").trim().toLowerCase() || boites.find((b) => b.personnelle)?.id || "";
  if (!cible) return null;
  return boiteAutorisee(boites, cible) ? cible : null;
}

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
// Fichiers joints depuis l'ordinateur : 3 Mo chacun (envoi simple de Graph), 10 au plus.
const zFichiers = z
  .array(z.object({ nom: z.string().trim().min(1).max(255), contentType: z.string().max(200), base64: z.string().max(4_200_000) }))
  .max(10);

/** Construit la Cible d'ecriture d'etat depuis un gestionnaire valide. */
function cibleDe(g: Gestionnaire, emailId: string, coproCode: string): Cible {
  return { gid: g.id, emailId, coproCode, initiales: g.initiales, ...(g.email ? { email: g.email } : {}) };
}

/** La Cible d'un changement de STATUT : sur une boite partagee visible, le statut vaut
 *  pour tous ceux qui la voient (Mylene conclut pour Nicolas, 15/10/2026). */
async function cibleStatut(g: Gestionnaire, emailId: string, coproCode: string, boite: string | undefined): Promise<Cible> {
  const c = cibleDe(g, emailId, coproCode);
  const demandee = (boite ?? "").trim().toLowerCase();
  if (!demandee) return c;
  const b = (await boitesVisibles(g)).find((x) => x.id === demandee);
  return b && !b.personnelle ? { ...c, boitePartagee: b.id } : c;
}

// PERF (Sentry 16/10/2026) : les actions legeres ne relancent PAS la page entiere.
// revalidatePath("/mes-emails") reconstruisait tout l'ecran apres un simple « Conclure »
// (boites Graph, portefeuille ESTALE, signature Signitic) : p95 de 5 s. L'ecran tient deja
// son etat (classes, etapes, brouillon, copro, mails partis) ; la page relue a la prochaine
// visite prend l'etat persiste.
// --- Actions d'etat (retour void : sur entree/auth invalide, on ne fait rien) -----------

/** Conclure l'événement : le mail sort de la liste « à traiter », sans bouger dans Outlook. */
export async function marquerTraiteAction(emailId: string, coproCode: string, boite?: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, boite: zBoite }).safeParse({ emailId, coproCode, boite }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerStatut(await cibleStatut(auth.g, emailId, coproCode, boite), "classe", []);
}

export async function devaliderMailAction(emailId: string, coproCode: string, boite?: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, boite: zBoite }).safeParse({ emailId, coproCode, boite }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerStatut(await cibleStatut(auth.g, emailId, coproCode, boite), "nouveau", []);
}

export async function toggleEtapeAction(emailId: string, coproCode: string, etapes: number[]): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, etapes: zEtapes }).safeParse({ emailId, coproCode, etapes }).success)
    return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerEtapes(cibleDe(auth.g, emailId, coproCode), etapes);
}

export async function editBrouillonAction(emailId: string, coproCode: string, brouillon: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro, brouillon: zCorps }).safeParse({ emailId, coproCode, brouillon }).success)
    return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerBrouillon(cibleDe(auth.g, emailId, coproCode), brouillon);
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
}

export async function marquerLuAction(emailId: string, coproCode: string): Promise<void> {
  if (!z.object({ emailId: zId, coproCode: zCopro }).safeParse({ emailId, coproCode }).success) return;
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return;
  await enregistrerLu(cibleDe(auth.g, emailId, coproCode));
}

/** Le contexte ESTALE d'une copro, à l'ouverture du volet Contexte (plus au chargement de
 *  la page). Toujours borné au périmètre du gestionnaire. */
export async function chargerContexteCoproAction(coproCode: string): Promise<ContexteCopro | null> {
  if (!zCopro.safeParse(coproCode).success || !coproCode) return null;
  const auth = await withGestionnaire(coproCode, true);
  if (!auth.ok) return null;
  return contexteCoproPour(coproCode);
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

// --- Rafraichir --------------------------------------------------------------

/**
 * Relit les boites MAINTENANT. Depuis le passage en lecture live (2026-08-23) il n'y a
 * plus rien a synchroniser : la page lit deja Graph a chaque rendu. Ce bouton ne fait
 * qu'invalider le rendu -- il existe pour le geste ("je veux voir ce qui vient
 * d'arriver"), pas pour un traitement.
 */
export async function rafraichirAction(): Promise<void> {
  const g = await getGestionnaireCourant();
  if (!g) return;
  // Reserve aux pilotes (MAIL_PILOTES) : un POST direct d'un non-pilote est refuse ici aussi.
  if (!mailModuleActifPour(g.email)) return;
  revalidatePath("/mes-emails");
}

// --- Pieces jointes (dans la boite qui DETIENT le mail) ----------------------

export async function chargerPiecesJointesAction(
  emailId: string,
  coproCode: string,
  boite?: string,
): Promise<PieceJointeRef[]> {
  if (!z.object({ emailId: zId, coproCode: zCopro, boite: zBoite }).safeParse({ emailId, coproCode, boite }).success)
    return [];
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok || !auth.g.email) return [];
  const cible = await boiteCible(auth.g, boite);
  if (!cible) return [];
  try {
    return await listerPiecesJointesMail(cible, emailId);
  } catch (e) {
    console.warn("[mes-emails] pieces jointes indisponibles :", (e as Error).message);
    return [];
  }
}

/** La réponse envoyée depuis la boîte qui détient le mail ; null si la boîte n'a pas pu être lue. */
export async function chargerReponsesEnvoyeesAction(emailId: string, boite?: string): Promise<ReponseEnvoyee[] | null> {
  if (!z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite }).success) return null;
  const g = await getGestionnaireCourant();
  if (!g?.email) return null;
  const cible = await boiteCible(g, boite);
  if (!cible) return null;
  try {
    return await reponsesEnvoyees(cible, emailId);
  } catch (e) {
    console.warn("[mes-emails] réponse envoyée indisponible :", (e as Error).message);
    return null;
  }
}

/** L'historique cité sous un mail reçu, lu dans la boîte qui le détient ; null si illisible. */
export async function chargerHistoriqueAction(emailId: string, boite?: string): Promise<string | null> {
  if (!z.object({ emailId: zId, boite: zBoite }).safeParse({ emailId, boite }).success) return null;
  const g = await getGestionnaireCourant();
  if (!g?.email) return null;
  const cible = await boiteCible(g, boite);
  if (!cible) return null;
  try {
    return await historiqueDuMail(cible, emailId);
  } catch (e) {
    console.warn("[mes-emails] historique indisponible :", (e as Error).message);
    return null;
  }
}

// --- « Pas pour moi » (REA-327) : un mail de la boîte partagée rangé chez le mauvais binôme ---

/** La boîte partagée du mail, si la personne la voit ; null sinon (boîte perso, boîte inconnue). */
async function boitePartageeDe(g: Gestionnaire, boite: string | undefined): Promise<string | null> {
  const demandee = (boite ?? "").trim().toLowerCase();
  const b = (await boitesVisibles(g)).find((x) => x.id === demandee);
  return b && !b.personnelle ? b.id : null;
}

export async function coprosPourReaffecterAction(): Promise<Res<CoproDestination[]>> {
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  try {
    return { ok: true, donnees: await coprosPourReaffecter() };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

export async function envoyerABonneCoproAction(emailId: string, reference: string, boite?: string): Promise<Res<{ dossierNom: string }>> {
  const v = z.object({ emailId: zId, reference: z.string().regex(/^(SE|S)\d{3,4}$/i), boite: zBoite }).safeParse({ emailId, reference, boite });
  if (!v.success) return echec("Données invalides.");
  const g = await getGestionnaireCourant();
  if (!g) return echec("Non connecté.");
  const partagee = await boitePartageeDe(g, boite);
  if (!partagee) return echec("Seul un mail de la boîte partagée peut changer de binôme.");
  try {
    const r = await envoyerABonneCopro(partagee, emailId, reference.toUpperCase(), g.email ?? g.id);
    return { ok: true, donnees: { dossierNom: r.dossierNom } };
  } catch (e) {
    return echecDepuis(e, "mes-emails");
  }
}

/** Les photos collées dans le corps (REA-328), validées par Sekou le 16/10/2026 sur de vrais mails. */
export async function chargerImagesMailAction(emailId: string, coproCode: string, boite?: string): Promise<PieceJointeRef[]> {
  if (!z.object({ emailId: zId, coproCode: zCopro, boite: zBoite }).safeParse({ emailId, coproCode, boite }).success) return [];
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok || !auth.g.email) return [];
  const cible = await boiteCible(auth.g, boite);
  if (!cible) return [];
  try {
    return await listerImagesMail(cible, emailId);
  } catch (e) {
    console.warn("[mes-emails] images du corps indisponibles :", (e as Error).message);
    return [];
  }
}

export async function telechargerPieceJointeAction(
  emailId: string,
  coproCode: string,
  attachmentId: string,
  boite?: string,
): Promise<{ ok: boolean; nom?: string; type?: string; base64?: string; message?: string }> {
  if (!z.object({ emailId: zId, coproCode: zCopro, attachmentId: zId, boite: zBoite }).safeParse({ emailId, coproCode, attachmentId, boite }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  if (!auth.g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  const cible = await boiteCible(auth.g, boite);
  if (!cible) return { ok: false, message: "Boîte non autorisée." };
  try {
    const pj = await lirePieceJointeMail(cible, emailId, attachmentId);
    return { ok: true, ...pj };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Depot d'une piece jointe sur SharePoint (bon d'intervention, facture) ------
// Coupe tant que SHAREPOINT_DEPOT_ACTIF n'est pas pose : renvoie alors un message clair.
// La copro est obligatoire (c'est elle qui donne le dossier SharePoint).

export async function deposerPieceJointeAction(
  emailId: string,
  coproCode: string,
  attachmentId: string,
  recuLe: string,
  boite?: string,
): Promise<{ ok: boolean; message?: string; webUrl?: string }> {
  if (
    !z
      .object({ emailId: zId, coproCode: zCopro.min(1), attachmentId: zId, recuLe: z.string().max(40).regex(/^\d{4}-\d{2}-\d{2}/), boite: zBoite })
      .safeParse({ emailId, coproCode, attachmentId, recuLe, boite }).success
  )
    return { ok: false, message: "Données invalides (la copropriété du mail est-elle renseignée ?)." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const cible = await boiteCible(auth.g, boite);
  if (!cible) return { ok: false, message: "Boîte non autorisée." };
  const r = await deposerPieceJointe({ boite: cible, internetMessageId: emailId, attachmentId, coproCode, recuLe });
  if (!r) return { ok: false, message: "Le dépôt sur SharePoint n'est pas encore branché (droit Sites.Selected à accorder)." };
  if (!r.depose) return { ok: false, message: `Dépôt impossible : ${r.raison}` };
  return { ok: true, webUrl: r.webUrl, message: `Déposé dans ${r.dossier}.` };
}

// --- Transmettre une facture a la boite factures ESTALE de l'agence ------------
// Brouillon de transfert (PJ conservees), objet codifie « COMPTE - FOURNISSEUR - Libelle ».

export async function transmettreFactureAction(
  emailId: string,
  coproCode: string,
  facture: { compte: string; fournisseur: string; libelle: string },
  boite?: string,
): Promise<{ ok: boolean; message?: string; webLink?: string }> {
  const zFacture = z.object({ compte: z.string().trim().regex(/^\d{3,8}$/), fournisseur: z.string().trim().min(1).max(120), libelle: z.string().trim().min(1).max(200) });
  if (!z.object({ emailId: zId, coproCode: zCopro, boite: zBoite }).safeParse({ emailId, coproCode, boite }).success || !zFacture.safeParse(facture).success)
    return { ok: false, message: "Compte (chiffres), fournisseur et libellé sont requis." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const cible = await boiteCible(auth.g, boite);
  if (!cible) return { ok: false, message: "Boîte non autorisée." };
  try {
    const r = await transmettreFacture({ boite: cible, internetMessageId: emailId, facture });
    if (r.simulation) return { ok: true, message: `Aperçu : « ${r.objet} » vers ${r.destinataire} (boîte non branchée, rien créé).` };
    return { ok: true, ...(r.webLink ? { webLink: r.webLink } : {}), message: `Brouillon de transfert « ${r.objet} » créé vers ${r.destinataire} : à relire puis envoyer dans Outlook.` };
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
    const reponse = await genererBrouillonMail(g, emailId);
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
  boiteMessage?: string,
  boiteEnvoi?: string,
  fichiers: unknown = [],
): Promise<{ ok: boolean; message?: string; filConserve?: boolean; historiqueCite?: boolean }> {
  const f = zFichiers.safeParse(fichiers);
  if (!f.success) return { ok: false, message: "Pièces jointes invalides (3 Mo et 10 fichiers au plus)." };
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
  if (!v.success || !zBoite.safeParse(boiteMessage).success || !zBoite.safeParse(boiteEnvoi).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const g = auth.g;
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  // Les DEUX boites sont validees contre la configuration : celle qui detient le mail
  // et celle qui expedie. Un "De :" fabrique cote client est refuse ici.
  const cibleMessage = await boiteCible(g, boiteMessage);
  const cibleEnvoi = await boiteCible(g, boiteEnvoi);
  if (!cibleMessage || !cibleEnvoi) return { ok: false, message: "Boîte non autorisée." };
  // Envoi RÉEL depuis une boîte partagée (syndicN) : seulement si MAIL_ENVOI=on (ADR-047).
  // Un mail qui part de la boîte commune engage le cabinet : pendant le pilote, on passe
  // par le brouillon, relu puis envoyé dans Outlook. La boîte perso garde son comportement.
  if (cibleEnvoi !== g.email.trim().toLowerCase() && !envoiMailActif()) {
    return {
      ok: false,
      message: "L'envoi depuis la boîte partagée est coupé pendant le pilote. Utilise « Brouillon Outlook » : il se relit et s'envoie dans Outlook.",
    };
  }
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
    const { filConserve, historiqueCite } = await envoyerReponseMail({
      boiteMessage: cibleMessage,
      boiteEnvoi: cibleEnvoi,
      internetMessageId: emailId,
      corps,
      sujet,
      a,
      cc,
      cci,
      ...(signatureHtml !== undefined ? { signatureHtml } : {}),
      pjIds,
      ...(f.data.length ? { piecesJointes: f.data } : {}),
    });
    revalidatePath("/mes-emails");
    return { ok: true, filConserve, ...(historiqueCite !== undefined ? { historiqueCite } : {}) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Attribution copro (a la main, ou retrait si vide) -----------------------

export async function rattacherCoproAction(
  emailId: string,
  coproCode: string,
  coproNom: string,
  boite?: string,
): Promise<{ ok: boolean; message?: string; envoiPropose?: { reference: string; dossier: string } }> {
  if (!z.object({ emailId: zId, coproCode: zCopro, coproNom: zCourt, boite: zBoite }).safeParse({ emailId, coproCode, coproNom, boite }).success)
    return { ok: false, message: "Données invalides." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  try {
    await enregistrerCopro(cibleDe(auth.g, emailId, coproCode), coproNom);
    // Boîte partagée : le journal du tri suit (vu par tout le binôme, mesure du tri).
    const tri = boite ? await reporterCoproAuTri(auth.g, boite, emailId, coproCode) : { corrige: false };
    if (tri.autreDossier) {
      // La copro relève d'un autre binôme : l'écran propose de lui envoyer le mail (REA-327).
      return {
        ok: true,
        message: `Copro corrigée dans le tri. Elle relève du dossier ${tri.autreDossier}.`,
        ...(tri.reference ? { envoiPropose: { reference: tri.reference, dossier: tri.autreDossier } } : {}),
      };
    }
    return { ok: true, ...(tri.corrige ? { message: "Copro corrigée aussi dans le tri." } : {}) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

// --- Dossiers Outlook + classement (dans la boite du mail) -------------------

/**
 * Crée le sous-dossier Outlook d'une copro dans SA boîte perso (geste explicite : un clic sur
 * « Créer le dossier »). Jamais dans une boîte partagée : le tri y range par binôme.
 */
export async function creerDossierOutlookAction(nom: string, boite?: string): Promise<{ ok: boolean; dossier?: DossierBoite; message?: string }> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return { ok: false, message: "Non connecté." };
  if (!z.string().trim().min(1).max(120).safeParse(nom).success || !zBoite.safeParse(boite).success)
    return { ok: false, message: "Nom de dossier invalide." };
  const cible = await boiteCible(g, boite);
  const perso = (await boitesVisibles(g)).find((b) => b.id === cible)?.personnelle;
  if (!cible || !perso) return { ok: false, message: "Le dossier ne se crée que dans votre boîte personnelle." };
  try {
    return { ok: true, dossier: await creerDossierBoite(cible, nom.trim()) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function chargerDossiersAction(boite?: string): Promise<DossierBoite[]> {
  const g = await getGestionnaireCourant();
  if (!g?.email) return [];
  if (!zBoite.safeParse(boite).success) return [];
  const cible = await boiteCible(g, boite);
  if (!cible) return [];
  try {
    return await listerDossiersBoite(cible);
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
  boite?: string,
): Promise<{ ok: boolean; message?: string }> {
  const v = z
    .object({ emailId: zId, coproCode: zCopro, folderId: zId, folderNom: zCourt, etapes: zEtapes, brouillon: zCorps })
    .safeParse({ emailId, coproCode, folderId, folderNom, etapes, brouillon });
  if (!v.success || !zBoite.safeParse(boite).success) return { ok: false, message: "Données invalides." };
  if (!folderId) return { ok: false, message: "Choisis un dossier de destination." };
  const auth = await withGestionnaire(coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const g = auth.g;
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  const cible = await boiteCible(g, boite);
  if (!cible) return { ok: false, message: "Boîte non autorisée." };
  try {
    const res = await classerDansDossier(cible, emailId, folderId);
    const c = cibleDe(g, emailId, coproCode);
    await enregistrerStatut(await cibleStatut(g, emailId, coproCode, cible), "classe", etapes, brouillon);
    await enregistrerDossier(c, folderId, folderNom);
    return res.deplace ? { ok: true } : { ok: false, message: "Le mail n'a pas pu être déplacé." };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/**
 * « Brouillon Outlook » : la réponse telle que préparée ici (destinataires, objet, pièces
 * jointes du mail et fichiers ajoutés) devient un brouillon dans la boîte du mail. Rien ne
 * part : on relit et on envoie dans Outlook. C'est la voie de la boîte partagée pendant le pilote.
 */
export async function creerBrouillonAction(input: unknown): Promise<{ ok: boolean; message?: string; webLink?: string }> {
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
      fichiers: zFichiers,
      boite: zBoite,
    })
    .safeParse(input);
  if (!v.success) return { ok: false, message: "Données invalides (pièces jointes : 3 Mo et 10 fichiers au plus)." };
  const d = v.data;
  const auth = await withGestionnaire(d.coproCode, cloisonnementCoproRequis());
  if (!auth.ok) return auth;
  const cible = await boiteCible(auth.g, d.boite);
  if (!cible) return { ok: false, message: "Boîte non autorisée." };
  const invalide = [...d.a, ...d.cc, ...d.cci].map((x) => x.trim()).find((x) => x && !EMAIL_RE.test(x));
  if (invalide) return { ok: false, message: `Adresse invalide : ${invalide}` };
  try {
    // Signitic ne passe pas sur un brouillon créé par l'app : on pose la signature nous-mêmes.
    const signatureHtml = (await getSignatureGestionnaire(auth.g)) ?? undefined;
    const { webLink } = await creerBrouillonReponse({
      boite: cible,
      ...(signatureHtml ? { signatureHtml } : {}),
      internetMessageId: d.emailId,
      corps: d.corps,
      ...(d.sujet.trim() ? { sujet: d.sujet } : {}),
      a: d.a,
      cc: d.cc,
      cci: d.cci,
      pjIds: d.pjIds,
      ...(d.fichiers.length ? { piecesJointes: d.fichiers } : {}),
    });
    return { ok: true, ...(webLink ? { webLink } : {}) };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
