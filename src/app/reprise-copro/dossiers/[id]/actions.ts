"use server";

// Server Actions de la FICHE-HUB d'un dossier de reprise. Contrat uniforme {ok,...} :
// jamais de throw cote client. Validation Zod. Cloisonnement : gestionnaire connecte exige
// (getGestionnaireCourant).
//
// NB : une reprise concerne une copro PAS ENCORE dans le perimetre eStale -> PAS de check
// coproAppartient ici. Un gestionnaire authentifie suffit.
//
// Deux familles d'actions :
//   - SUIVI HUMAIN : majEtapeAction / ajouterNoteAction (cyclage de statut + journal).
//   - PATRIMOINE (pilote IA) : produireAction (xlsx de repli), injecterAction (dry-run ou
//     REEL selon ESTALE_ECRITURE). L'ANALYSE vit dans la route POST /api/reprise/analyser
//     (multipart natif, sans les limites body/serialisation des Server Actions).
//
// L'injection dry-run NE TOUCHE AUCUN RESEAU (adapter dry-run du routeur).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import {
  getRepriseDossierRepository,
  getEstaleEcritureProvider,
  ecritureEstaleReelle,
  getFicheRenseignementsRepository,
  getEstaleFicheContactProvider,
} from "@/lib/reprise/adapters/router";
import {
  majEtape,
  ajouterJournal,
  trancherLiaisonDossier,
  obtenirDossier,
  corrigerJeuDossier,
  archiverDossier,
  supprimerDossierEtFiches,
  validerContactAnnexeDossier,
  ignorerContactAnnexeDossier,
} from "@/lib/reprise/services/suivi-dossier";
import type { Correction } from "@/lib/reprise/domain/corrections-patrimoine";
import type { ContactRapproche } from "@/lib/reprise/domain/rapprochement-contacts";
import { USAGES, CIVILITES } from "@/lib/reprise/domain/patrimoine";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import { genererCourriers, validerFiche, envoyerFicheParEmail } from "@/lib/reprise/services/fiches-renseignements";
import { genererCourriersDocument, type ContexteCourrier } from "@/lib/reprise/domain/fiche-courrier";
import { objetMailEspaceClient, corpsMailEspaceClient } from "@/lib/reprise/domain/mail-espace-client";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { envoyerMailReunion } from "@/lib/services/coproprietes/envoyer-mail-reunion";
import type { LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import { produirePhaseABuffers } from "@/lib/reprise/services/orchestrateur-patrimoine";
import { onboarderCopro, type MetadonneesCopro } from "@/lib/reprise/services/onboarder-copro";
import { ETABLISSEMENT_IDS } from "@/lib/reprise/domain/etablissements";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

export type ActionResultat = { ok: true } | { ok: false; message: string };

const schemaMajEtape = z.object({
  dossierId: z.string().trim().min(1).max(40),
  etapeCode: z.string().trim().min(1).max(20),
  statut: z.enum(["a_faire", "en_cours", "fait", "ignore"]),
});

const schemaNote = z.object({
  dossierId: z.string().trim().min(1).max(40),
  texte: z.string().trim().min(1).max(500),
});

// Le jeu de donnees transite en JSON entre analyse, production et injection. On le valide
// de facon souple (structure attendue) : les auto-checks deterministes / le mapping font
// le vrai controle en aval.
const zJeu = z.object({
  lots: z.array(z.unknown()).max(50_000),
  cles: z.array(z.unknown()).max(2_000),
  tantiemes: z.array(z.unknown()).max(500_000),
  owners: z.array(z.unknown()).max(50_000),
  attributions: z.array(z.unknown()).max(500_000),
});

/** Change le statut d'une etape de suivi (par code, ex. "V2"). */
export async function majEtapeAction(
  dossierId: string,
  etapeCode: string,
  statut: string,
): Promise<ActionResultat> {
  const valid = schemaMajEtape.safeParse({ dossierId, etapeCode, statut });
  if (!valid.success) {
    return { ok: false, message: "Etape ou statut invalide." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour modifier ce dossier." };

  const repo = getRepriseDossierRepository();
  try {
    await majEtape(repo, valid.data.dossierId, valid.data.etapeCode, valid.data.statut);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Mise a jour impossible." };
  }

  revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
  revalidatePath("/reprise-copro/dossiers");
  return { ok: true };
}

/** Ajoute une note au journal du dossier (date ISO fabriquee ici). */
export async function ajouterNoteAction(dossierId: string, texte: string): Promise<ActionResultat> {
  const valid = schemaNote.safeParse({ dossierId, texte });
  if (!valid.success) {
    return { ok: false, message: "Note requise (500 caracteres max)." };
  }

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour ajouter une note." };

  const repo = getRepriseDossierRepository();
  try {
    await ajouterJournal(repo, valid.data.dossierId, new Date().toISOString(), valid.data.texte);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ajout impossible." };
  }

  revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
  return { ok: true };
}

// --- ARCHIVAGE / SUPPRESSION d'un dossier de reprise ------------------------

const schemaArchiver = z.object({
  dossierId: z.string().trim().min(1).max(40),
  archive: z.boolean(),
});

/** Archive ou desarchive un dossier (reversible, flag JSONB). Cloisonnement : gestionnaire connecte. */
export async function archiverDossierAction(dossierId: string, archive: boolean): Promise<ActionResultat> {
  const valid = schemaArchiver.safeParse({ dossierId, archive });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour archiver ce dossier." };

  try {
    await archiverDossier(getRepriseDossierRepository(), valid.data.dossierId, valid.data.archive, new Date().toISOString());
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Archivage impossible." };
  }

  revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
  revalidatePath("/reprise-copro/dossiers");
  return { ok: true };
}

/**
 * Supprime DEFINITIVEMENT un dossier de reprise + ses fiches de renseignements liees (hard delete,
 * irreversible). Cloisonnement : gestionnaire connecte. Redirige vers la liste (comme le module
 * Dossiers generaliste). AUCUNE mutation eStale (une copro deja injectee n'est pas touchee).
 */
export async function supprimerDossierRepriseAction(dossierId: string): Promise<ActionResultat> {
  const valid = z.string().trim().min(1).max(40).safeParse(dossierId);
  if (!valid.success) return { ok: false, message: "Dossier invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour supprimer ce dossier." };

  try {
    await supprimerDossierEtFiches(getRepriseDossierRepository(), getFicheRenseignementsRepository(), valid.data);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Suppression impossible." };
  }

  revalidatePath("/reprise-copro/dossiers");
  redirect("/reprise-copro/dossiers");
}

// --- LIAISON owners <-> comptes 450 (revue humaine des cas ambigus) ---------

const schemaTrancherLiaison = z.object({
  dossierId: z.string().trim().min(1).max(40),
  ownerId: z.string().trim().min(1).max(80),
  // Numero de compte 450 choisi, ou "" pour "sans compte" (dissociation).
  compteSource: z.string().trim().max(60),
});

export type TrancherLiaisonResultat =
  | { ok: true; liaisons: LiaisonOwnerCompte[] }
  | { ok: false; message: string };

/**
 * Tranche une liaison owner <-> compte 450 ambigue : rattache le compte choisi (ou dissocie si
 * vide). Persiste le jeu. Cloisonnement : gestionnaire connecte exige. Ne bloque jamais
 * l'injection patrimoine (la liaison est un complement compta, pas un pre-requis).
 */
export async function trancherLiaisonAction(
  dossierId: string,
  ownerId: string,
  compteSource: string,
): Promise<TrancherLiaisonResultat> {
  const valid = schemaTrancherLiaison.safeParse({ dossierId, ownerId, compteSource });
  if (!valid.success) return { ok: false, message: "Liaison invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour trancher cette liaison." };

  try {
    const liaisons = await trancherLiaisonDossier(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      valid.data.ownerId,
      valid.data.compteSource.length > 0 ? valid.data.compteSource : null,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, liaisons };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Mise a jour de la liaison impossible." };
  }
}

// --- DOCUMENTS ANNEXES : contacts rapproches (valider -> owner.modifier / ignorer) ----------

const schemaValiderContact = z.object({
  dossierId: z.string().trim().min(1).max(40),
  contactId: z.string().trim().min(1).max(60),
  ownerId: z.string().trim().min(1).max(80),
});

export type ContactAnnexeResultat =
  | { ok: true; jeu?: JeuDeDonnees; contacts: ContactRapproche[] }
  | { ok: false; message: string };

/**
 * VALIDE un contact d'annexe : ecrit son email/telephone sur l'owner choisi (`ownerId` = l'owner
 * apparie OU un owner corrige a la main). Reutilise le mecanisme de corrections (owner.modifier ->
 * transactionnel + journalise + auto-checks). Cloisonnement : gestionnaire connecte. AUCUNE
 * mutation eStale (jeu local seulement).
 */
export async function validerContactAnnexeAction(
  dossierId: string,
  contactId: string,
  ownerId: string,
): Promise<ContactAnnexeResultat> {
  const valid = schemaValiderContact.safeParse({ dossierId, contactId, ownerId });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour valider ce contact." };

  try {
    const r = await validerContactAnnexeDossier(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      valid.data.contactId,
      valid.data.ownerId,
      new Date().toISOString(),
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, jeu: r.jeu, contacts: r.contacts };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Validation du contact impossible." };
  }
}

const schemaIgnorerContact = z.object({
  dossierId: z.string().trim().min(1).max(40),
  contactId: z.string().trim().min(1).max(60),
});

/** IGNORE un contact d'annexe (proposition ecartee). Cloisonnement : gestionnaire connecte. */
export async function ignorerContactAnnexeAction(
  dossierId: string,
  contactId: string,
): Promise<ContactAnnexeResultat> {
  const valid = schemaIgnorerContact.safeParse({ dossierId, contactId });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi." };

  try {
    const contacts = await ignorerContactAnnexeDossier(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      valid.data.contactId,
      new Date().toISOString(),
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, contacts };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Action impossible." };
  }
}

// --- EDITEUR DE CORRECTIONS du jeu patrimoine (ADR-030) ---------------------
// Quand l'extraction IA lit mal un scan, on corrige le jeu persiste A LA MAIN (tantieme faux,
// lot manque, doublon d'owner) : les corrections sont validees en Zod puis appliquees au domaine
// PUR (transactionnel), les auto-checks repassent, le dossier redevient injectable. AUCUNE
// mutation eStale : ca ne touche QUE le jeu local.

const zUsage = z.enum(USAGES as unknown as [string, ...string[]]);
const zCivilite = z.enum(CIVILITES as unknown as [string, ...string[]]);

const zLot = z.object({
  numero: z.number().int().positive(),
  type: z.string().max(100),
  usage: zUsage,
  escalier: z.string().max(10).optional(),
  etage: z.number().int().optional(),
  porte: z.string().max(10).optional(),
  surface: z.number().optional(),
  nbPiece: z.number().int().optional(),
  commentaire: z.string().max(256),
});
const zLotChamps = zLot.omit({ numero: true }).partial();

const zCle = z.object({
  code: z.string().min(1).max(10),
  libelle: z.string().max(500),
  totalAttendu: z.number(),
  defaut: z.boolean().optional(),
  commentaire: z.string().max(500).optional(),
});
const zCleChamps = zCle.omit({ code: true }).partial();

const zTantieme = z.object({
  cleCode: z.string().min(1).max(10),
  lot: z.number().int(),
  valeur: z.number(),
});

const zOwner = z.object({
  id: z.string().min(1).max(80),
  civilite: zCivilite,
  nom: z.string().max(80),
  prenom: z.string().max(80).optional(),
  pro: z.boolean(),
  naissance: z.string().max(20).optional(),
  email: z.string().max(120).optional(),
  occupant: z.boolean().nullable().optional(),
  lieuNaissance: z.string().max(120).optional(),
  nationalite: z.string().max(120).optional(),
  telPortable: z.string().max(30).optional(),
  telFixe: z.string().max(30).optional(),
  adrNum: z.string().max(40).optional(),
  adrVoie: z.string().max(200).optional(),
  adrComplement: z.string().max(200).optional(),
  adrCodePostal: z.string().max(20).optional(),
  adrVille: z.string().max(120).optional(),
  paysAdresse: z.string().max(80).optional(),
  formeJuridique: z.string().max(40).optional(),
  raisonSociale: z.string().max(120).optional(),
  siren: z.string().max(20).optional(),
  capital: z.number().optional(),
  commentaire: z.string().max(200).optional(),
});
const zOwnerChamps = zOwner.omit({ id: true }).partial();

const zCorrection = z.discriminatedUnion("type", [
  z.object({ type: z.literal("lot.modifier"), numero: z.number().int(), champs: zLotChamps }),
  z.object({ type: z.literal("lot.ajouter"), lot: zLot }),
  z.object({ type: z.literal("lot.supprimer"), numero: z.number().int(), cascade: z.boolean().optional() }),
  z.object({ type: z.literal("cle.modifier"), code: z.string().max(10), champs: zCleChamps }),
  z.object({ type: z.literal("cle.ajouter"), cle: zCle }),
  z.object({ type: z.literal("cle.supprimer"), code: z.string().max(10), cascade: z.boolean().optional() }),
  z.object({ type: z.literal("tantieme.modifier"), cleCode: z.string().max(10), lot: z.number().int(), valeur: z.number() }),
  z.object({ type: z.literal("tantieme.ajouter"), tantieme: zTantieme }),
  z.object({ type: z.literal("tantieme.supprimer"), cleCode: z.string().max(10), lot: z.number().int() }),
  z.object({ type: z.literal("owner.modifier"), id: z.string().max(80), champs: zOwnerChamps }),
  z.object({ type: z.literal("owner.ajouter"), owner: zOwner }),
  z.object({ type: z.literal("owner.supprimer"), id: z.string().max(80), reattribuerVers: z.string().max(80).optional() }),
  z.object({ type: z.literal("owner.fusionner"), survivantId: z.string().max(80), absorbeId: z.string().max(80) }),
  z.object({ type: z.literal("attribution.reattacher"), lot: z.number().int(), versOwnerId: z.string().max(80), deOwnerId: z.string().max(80).optional() }),
  z.object({ type: z.literal("attribution.ajouter"), ownerId: z.string().max(80), lot: z.number().int() }),
  z.object({ type: z.literal("attribution.supprimer"), ownerId: z.string().max(80), lot: z.number().int() }),
]);
const zCorrections = z.array(zCorrection).min(1).max(5000);

export type CorrigerResultat =
  | { ok: true; jeu: JeuDeDonnees; recap: RecapPatrimoine; notes: string[] }
  | { ok: false; message: string };

/**
 * Applique un lot de corrections manuelles au jeu persiste du dossier (editeur ADR-030).
 * Cloisonnement (gestionnaire connecte) + Zod strict. Renvoie le jeu + recap recalcules pour que
 * l'UI rafraichisse compteurs/badges/ecarts SANS re-analyser. Le detail vit dans le journal (base) ;
 * le log serveur reste PII-free (compteur de modifications, pas de nom).
 */
export async function corrigerJeuAction(dossierId: string, corrections: Correction[]): Promise<CorrigerResultat> {
  const idOk = z.string().trim().min(1).max(40).safeParse(dossierId);
  if (!idOk.success) return { ok: false, message: "Dossier invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour corriger le jeu." };

  const valid = zCorrections.safeParse(corrections);
  if (!valid.success) return { ok: false, message: "Corrections invalides (format inattendu)." };

  try {
    const res = await corrigerJeuDossier(
      getRepriseDossierRepository(),
      idOk.data,
      valid.data as Correction[],
      new Date().toISOString(),
    );
    // Log serveur PII-free : seul le compteur de modifications, jamais un nom (detail = journal).
    console.info(`[reprise] Correction manuelle dossier ${idOk.data} : ${valid.data.length} modification(s).`);
    revalidatePath(`/reprise-copro/dossiers/${idOk.data}`);
    return { ok: true, jeu: res.jeu, recap: res.recap, notes: res.notes };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Correction impossible." };
  }
}

// --- PATRIMOINE (pilote IA) -------------------------------------------------
// L'ANALYSE des documents ne vit plus ici : c'est la route handler POST /api/reprise/analyser
// (multipart natif, sans les limites body/serialisation des Server Actions).

export type FichierProduit = { nom: string; base64: string };

export type ProduireResultat =
  | { ok: true; fichiers: FichierProduit[] }
  | { ok: false; message: string };

/** Produit les .xlsx eStale (repli). Re-verifie les auto-checks cote serveur (garde-fou). */
export async function produireAction(dossierId: string, jeu: JeuDeDonnees): Promise<ProduireResultat> {
  const idOk = z.string().trim().min(1).max(40).safeParse(dossierId);
  if (!idOk.success) return { ok: false, message: "Dossier invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour produire les fichiers." };

  const valid = zJeu.safeParse(jeu);
  if (!valid.success) return { ok: false, message: "Jeu de donnees invalide ou absent." };

  try {
    const fichiers = await produirePhaseABuffers(jeu);
    return {
      ok: true,
      fichiers: fichiers.map((f) => ({
        nom: f.nom,
        base64: Buffer.from(f.contenu).toString("base64"),
      })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la production." };
  }
}

// --- INJECTION eStale (dry-run par defaut, reel si ESTALE_ECRITURE=reel) -----

/** Une operation du plan, resumee pour l'affichage. */
export type OperationVue = { seq: number; mutation: string; cible: string; ref?: string };

export type RapportInjectionVue = {
  succes: boolean;
  /** true si l'ecriture a eu lieu en REEL (PROD), false si simulation dry-run. */
  reel: boolean;
  /** true si la copro a ete creee par cet appel (createCondo). */
  coproCreee: boolean;
  condoID: string;
  compteurs: { lots: number; cles: number; tantiemes: number; owners: number; links: number };
  /** Plan ordonne resume (les 1res operations de chaque famille + total). */
  operations: OperationVue[];
  operationsTotal: number;
  avertissements: string[];
  erreur?: string;
};

export type InjecterResultat = { ok: true; rapport: RapportInjectionVue } | { ok: false; message: string };

// Metadonnees copro fournies par l'UI (selecteur d'etablissement + champs manquants).
// L'establishmentID est valide contre la liste FERMEE des 4 etablissements REAL31.
const zMetaCopro = z.object({
  name: z.string().trim().min(1).max(120),
  reference: z.string().trim().min(1).max(40),
  management: z.enum(["CONDO", "AS", "AFU"]),
  establishmentID: z.enum(ETABLISSEMENT_IDS as [string, ...string[]]),
  address: z.object({
    postcode: z.string().trim().min(1).max(10),
    city: z.string().trim().min(1).max(80),
    country: z.string().trim().min(1).max(60),
    housenumber: z.string().trim().max(20).optional(),
    street: z.string().trim().max(120).optional(),
  }),
});

/**
 * Onboarde la copro dans eStale : cree la copro (createCondo) PUIS injecte le patrimoine.
 * Passe par le service onboarderCopro et le provider du routeur.
 *
 * MODE : par defaut DRY-RUN (aucun reseau). Si ESTALE_ECRITURE=reel + identifiants presents,
 * le provider du routeur ECRIT en PRODUCTION. L'UI reflete le mode et exige un GO/STOP avant.
 * Le rapport porte `reel` pour que l'UI le rappelle explicitement.
 */
export async function injecterAction(
  dossierId: string,
  jeu: JeuDeDonnees,
  meta: MetadonneesCopro,
): Promise<InjecterResultat> {
  const idOk = z.string().trim().min(1).max(40).safeParse(dossierId);
  if (!idOk.success) return { ok: false, message: "Dossier invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour lancer l'injection." };

  const valid = zJeu.safeParse(jeu);
  if (!valid.success) return { ok: false, message: "Jeu de donnees invalide ou absent." };

  const metaOk = zMetaCopro.safeParse(meta);
  if (!metaOk.success) {
    return { ok: false, message: "Etablissement ou metadonnees copro invalides (etablissement + adresse requis)." };
  }

  const reel = ecritureEstaleReelle();

  try {
    const provider = getEstaleEcritureProvider();
    const r = await onboarderCopro(provider, jeu, { metadonnees: metaOk.data as MetadonneesCopro });

    // Plan resume : on garde jusqu'a 12 lignes representatives (les 1res operations),
    // le total complet reste affiche par ailleurs.
    const LIMITE = 12;
    const operations: OperationVue[] = r.injection.operations.slice(0, LIMITE).map((op) => ({
      seq: op.seq,
      mutation: op.mutation,
      cible: op.cibleDomaine,
      ref: op.resultat?.reference ?? op.resultat?.code,
    }));

    const erreur =
      r.erreurCreation !== undefined
        ? `createCondo (${metaOk.data.reference}) : ${r.erreurCreation}`
        : r.injection.erreur
          ? `${r.injection.erreur.operation} (${r.injection.erreur.cibleDomaine}) : ${r.injection.erreur.message}`
          : undefined;

    // Trace au journal quand c'est une ecriture REELLE reussie (tracabilite PROD).
    if (reel && r.succes) {
      await ajouterJournal(
        getRepriseDossierRepository(),
        idOk.data,
        new Date().toISOString(),
        `Injection eStale REELLE : copro creee (condo ${r.condoID}), ${r.injection.compteurs.lots} lot(s), ${r.injection.compteurs.owners} coproprietaire(s).`,
      );
      revalidatePath(`/reprise-copro/dossiers/${idOk.data}`);
    }

    const rapport: RapportInjectionVue = {
      succes: r.succes,
      reel,
      coproCreee: r.coproCreee,
      condoID: r.condoID,
      compteurs: r.injection.compteurs,
      operations,
      operationsTotal: r.injection.operations.length,
      avertissements: r.injection.avertissements.map((a) => a.message),
      ...(erreur ? { erreur } : {}),
    };
    return { ok: true, rapport };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'injection." };
  }
}

// --- FICHES DE RENSEIGNEMENTS (courriers -> formulaire public -> validation) -----

/** Base URL publique du formulaire : env explicite, sinon reconstruite depuis la requete. */
async function baseUrlPublique(): Promise<string> {
  const override = process.env.FICHE_PUBLIC_BASE_URL;
  if (override) return override.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export type GenererCourriersResultat =
  | { ok: true; html: string; nbCourriers: number; ignores: number }
  | { ok: false; message: string };

const zGenerer = z.object({
  dossierId: z.string().trim().min(1).max(40),
  ownerIds: z.array(z.string().trim().min(1).max(80)).max(50_000).optional(),
  relance: z.boolean().optional(),
});

/**
 * Genere le document HTML imprimable des courriers "fiche de renseignements" (une page par
 * coproprietaire, lien + code personnel). Cree/regenere les fiches en base (token + code
 * hashes). Les fiches DEJA soumises/validees ne sont pas regenerees. Le HTML (secrets en clair)
 * n'est renvoye QU'ICI, jamais relogue ni restocke.
 */
export async function genererCourriersFicheAction(
  dossierId: string,
  options?: { ownerIds?: string[]; relance?: boolean },
): Promise<GenererCourriersResultat> {
  const valid = zGenerer.safeParse({ dossierId, ...options });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour generer les courriers." };

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };
  if (!dossier.jeu || dossier.jeu.owners.length === 0) {
    return { ok: false, message: "Aucun coproprietaire dans le jeu : lance d'abord l'analyse (l'onglet Patrimoine)." };
  }

  try {
    const nowISO = new Date().toISOString();
    const r = await genererCourriers(getFicheRenseignementsRepository(), dossier, {
      baseUrl: await baseUrlPublique(),
      nowISO,
      ...(valid.data.ownerIds ? { ownerIds: valid.data.ownerIds } : {}),
      ...(valid.data.relance ? { relance: true } : {}),
    });
    // L'erreur du service (ex. persistance indisponible = table absente) prime sur le
    // message generique : c'est elle qui dit QUOI faire.
    if (r.erreur) return { ok: false, message: r.erreur };
    if (r.courriers.length === 0) {
      return { ok: false, message: `Aucun courrier a generer (${r.ignores} deja repondu(s)).` };
    }

    const ctx: ContexteCourrier = {
      coproNom: dossier.nomUsuel,
      coproRef: dossier.ref,
      ...(dossier.adresse ? { coproAdresseLigne1: dossier.adresse } : {}),
      retourEmail: g.email ?? "votre gestionnaire REAL31",
      ...(g.email ? { gestionnaireEmail: g.email } : {}),
      expediteur: ["REAL 31", "Syndic de copropriete"],
    };
    const html = genererCourriersDocument(ctx, r.courriers);

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      nowISO,
      valid.data.relance
        ? `Courriers de relance generes pour ${r.courriers.length} coproprietaire(s).`
        : `Courriers "fiche de renseignements" generes pour ${r.courriers.length} coproprietaire(s).`,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, html, nbCourriers: r.courriers.length, ignores: r.ignores };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la generation." };
  }
}

export type ValiderFicheResultat =
  | { ok: true; message: string; estaleApplique: boolean; mailEnvoye: boolean; mailNote?: string }
  | { ok: false; message: string };

const zValider = z.object({
  dossierId: z.string().trim().min(1).max(40),
  ownerId: z.string().trim().min(1).max(80),
});

/**
 * Valide la fiche d'UN coproprietaire (jamais en masse) : ecrit l'email dans eStale (via le
 * port dedie, dry-run ou reel selon ESTALE_ECRITURE) PUIS envoie le mail "espace client pret"
 * si le module mail est actif pour ce gestionnaire (MAIL_SOURCE=graph + MAIL_PILOTES). Sinon,
 * note visible "mail non envoye". Boite d'envoi = email de session (jamais un parametre).
 */
export async function validerFicheAction(dossierId: string, ownerId: string): Promise<ValiderFicheResultat> {
  const valid = zValider.safeParse({ dossierId, ownerId });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour valider." };

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };

  const mailActif = mailModuleActifPour(g.email) && Boolean(g.email);

  // Callback d'envoi : porte le gate mail. Renvoie envoye=false + note si le module est inactif.
  const envoyerMail = async ({ email, destinataire }: { email: string; destinataire: string }) => {
    if (!mailActif) {
      return { envoye: false, note: "Mail non envoye : module mail inactif (MAIL_SOURCE / MAIL_PILOTES)." };
    }
    try {
      const sujet = objetMailEspaceClient({ destinataire, coproNom: dossier.nomUsuel, coproRef: dossier.ref });
      const corps = corpsMailEspaceClient({ destinataire, coproNom: dossier.nomUsuel, coproRef: dossier.ref });
      const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
      await envoyerMailReunion({ boite: g.email!, a: [email], cc: [], cci: [], sujet, corps, signatureHtml });
      return { envoye: true };
    } catch (e) {
      return { envoye: false, note: `Mail non envoye : ${(e as Error).message || "erreur Graph"}.` };
    }
  };

  try {
    const r = await validerFiche(
      getFicheRenseignementsRepository(),
      getEstaleFicheContactProvider(),
      valid.data.ownerId,
      dossier.ref,
      envoyerMail,
      new Date().toISOString(),
    );
    if (!r.ok) return { ok: false, message: r.message };

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      new Date().toISOString(),
      `Fiche validee (owner ${valid.data.ownerId}) : ${r.estale?.applique ? "email ecrit dans eStale" : "eStale dry-run"}${r.mailEnvoye ? ", mail espace client envoye" : ", mail non envoye"}.`,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return {
      ok: true,
      message: r.message,
      estaleApplique: r.estale?.applique ?? false,
      mailEnvoye: r.mailEnvoye,
      ...(r.mailNote ? { mailNote: r.mailNote } : {}),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la validation." };
  }
}

export type EnvoyerFicheEmailResultat =
  | { ok: true; message: string; envoye: boolean; note?: string }
  | { ok: false; message: string };

const zEnvoyerFicheEmail = z.object({
  dossierId: z.string().trim().min(1).max(40),
  ownerId: z.string().trim().min(1).max(80),
});

/**
 * BONUS EMAIL : envoie la fiche de renseignements d'un coproprietaire PAR EMAIL (lien + code) au
 * lieu du courrier postal, quand son email est connu dans le jeu. Genere/regenere la fiche (token +
 * code) puis envoie le mail via le gate MAIL_SOURCE/MAIL_PILOTES (comme la validation de fiche).
 * Owner sans email valide -> refus (il reste au courrier). Boite d'envoi = email de session.
 */
export async function envoyerFicheEmailAction(dossierId: string, ownerId: string): Promise<EnvoyerFicheEmailResultat> {
  const valid = zEnvoyerFicheEmail.safeParse({ dossierId, ownerId });
  if (!valid.success) return { ok: false, message: "Parametres invalides." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour envoyer la fiche." };

  const dossier = await obtenirDossier(getRepriseDossierRepository(), valid.data.dossierId);
  if (!dossier) return { ok: false, message: "Dossier introuvable." };

  const mailActif = mailModuleActifPour(g.email) && Boolean(g.email);

  // Callback d'envoi : porte le gate mail (comme validerFicheAction). Le corps/objet sont composes
  // par le service (lien + code) ; ici on ne fait que router vers Graph avec la signature du gestionnaire.
  const envoyerMail = async ({
    email,
    sujet,
    corps,
  }: {
    email: string;
    destinataire: string;
    sujet: string;
    corps: string;
  }) => {
    if (!mailActif) {
      return { envoye: false, note: "Mail non envoye : module mail inactif (MAIL_SOURCE / MAIL_PILOTES)." };
    }
    try {
      const signatureHtml = (await getSignatureGestionnaire(g)) ?? undefined;
      await envoyerMailReunion({ boite: g.email!, a: [email], cc: [], cci: [], sujet, corps, signatureHtml });
      return { envoye: true };
    } catch (e) {
      return { envoye: false, note: `Mail non envoye : ${(e as Error).message || "erreur Graph"}.` };
    }
  };

  try {
    const r = await envoyerFicheParEmail(
      getFicheRenseignementsRepository(),
      dossier,
      valid.data.ownerId,
      { baseUrl: await baseUrlPublique(), nowISO: new Date().toISOString() },
      envoyerMail,
    );
    if (!r.ok) return { ok: false, message: r.message };

    await ajouterJournal(
      getRepriseDossierRepository(),
      valid.data.dossierId,
      new Date().toISOString(),
      `Fiche envoyee par EMAIL (owner ${valid.data.ownerId})${r.envoye ? "" : " - mail non parti"}.`,
    );
    revalidatePath(`/reprise-copro/dossiers/${valid.data.dossierId}`);
    return { ok: true, message: r.message, envoye: r.envoye, ...(r.note ? { note: r.note } : {}) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'envoi." };
  }
}
