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
//   - PATRIMOINE (pilote IA) : analyserAction (extraction + report dans le dossier via
//     appliquerRecap), produireAction (xlsx de repli), injecterAction (dry-run eStale).
//
// L'injection dry-run NE TOUCHE AUCUN RESEAU (adapter dry-run du routeur).

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import {
  getRepriseDossierRepository,
  getExtractionProvider,
  getEstaleEcritureProvider,
  ecritureEstaleReelle,
  modeExtraction,
  type ModeExtraction,
} from "@/lib/reprise/adapters/router";
import {
  majEtape,
  ajouterJournal,
  appliquerRecap,
} from "@/lib/reprise/services/suivi-dossier";
import {
  analyserPatrimoine,
  produirePhaseABuffers,
  type RecapPatrimoine,
} from "@/lib/reprise/services/orchestrateur-patrimoine";
import { onboarderCopro, type MetadonneesCopro } from "@/lib/reprise/services/onboarder-copro";
import { ETABLISSEMENT_IDS } from "@/lib/reprise/domain/etablissements";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
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

// --- PATRIMOINE (pilote IA) -------------------------------------------------

export type AnalyseResultat =
  | { ok: true; recap: RecapPatrimoine; jeu: JeuDeDonnees; mode: ModeExtraction }
  | { ok: false; message: string };

/**
 * Analyse les documents deposes (extraction Agent 1 + 2 + auto-checks), PUIS reporte le
 * recap dans le dossier (appliquerRecap : compteurs + anomalies actionnables) et trace une
 * ligne de journal. Renvoie recap + jeu : le jeu reste cote client pour produire / injecter.
 */
export async function analyserAction(dossierId: string, formData: FormData): Promise<AnalyseResultat> {
  const idOk = z.string().trim().min(1).max(40).safeParse(dossierId);
  if (!idOk.success) return { ok: false, message: "Dossier invalide." };

  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour lancer une analyse." };

  const files = formData.getAll("pdfs").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, message: "Aucun PDF fourni." };
  if (files.length > 50) return { ok: false, message: "Trop de fichiers (50 maximum)." };

  const docs: DocumentSource[] = await Promise.all(
    files.map(async (f) => ({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) })),
  );

  const repo = getRepriseDossierRepository();
  try {
    const { jeu, recap } = await analyserPatrimoine(getExtractionProvider(), docs);
    // Reporte les compteurs + anomalies dans le dossier (le patrimoine devient des etats).
    await appliquerRecap(repo, idOk.data, recap);
    await ajouterJournal(
      repo,
      idOk.data,
      new Date().toISOString(),
      `Analyse des documents : ${recap.lots.total} lot(s), ${recap.cles.length} cle(s), ${recap.owners.total} coproprietaire(s).`,
    );
    revalidatePath(`/reprise-copro/dossiers/${idOk.data}`);
    revalidatePath("/reprise-copro/dossiers");
    return { ok: true, recap, jeu, mode: modeExtraction() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse." };
  }
}

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
