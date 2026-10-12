// Service du tri des e-mails V2 (ADR-046) : la file a trier = la boite de reception de
// la boite generique, lue en direct. Pour chaque mail : la copro ESTALE proposee ; pour
// chaque copro : ou partirait le mail (dossier aux initiales du gestionnaire).
// Lecture : rien n'est deplace ici (le rangement vit dans ranger.ts). Les mails deja
// ranges (journal non annule) sont retires de la file, ce qui couvre aussi la simulation
// ou le mail n'a pas bouge.

import {
  AUCUN_BINOME,
  destinationDe,
  dossiersChoisissables,
  lignesBinomes,
  type DossierChoisissable,
  suggererCopro,
  type CoproTri,
  type Destination,
  type EntreeJournalTri,
  type LigneBinome,
  type MailATrier,
  type Suggestion,
} from "@/lib/domain/tri-emails";
import { boiteTriConfiguree, debutTri } from "@/lib/domain/mail-gate";
import {
  getIngestionTri,
  getReferentielTriProvider,
  getTriRepository,
} from "@/lib/adapters/router";
import { rangementSimule } from "./ranger";
import { reconcilierRangements } from "./reconcilier";
import { listerCollaborateurs, listerGestionnairesCabinet, type Collaborateur } from "./binomes";

/** Nombre de mails lus a chaque affichage : la file du jour, pas l'historique. */
const MAX_FILE = 100;
/** Longueur du texte affiche ; la suggestion lit un peu plus loin. */
const APERCU = 1500;
const TEXTE_ANALYSE = 4000;

export interface MailDeLaFile extends MailATrier {
  suggestion: Suggestion;
}

export interface CoproDeLaFile extends CoproTri {
  destination: Destination | null;
}

export interface FileATrier {
  /** Adresse lue, ou "echantillon". */
  boite: string;
  mails: MailDeLaFile[];
  copros: CoproDeLaFile[];
  /** Rangements des 7 derniers jours (revue de fin de semaine), les plus recents d'abord. */
  journal: EntreeJournalTri[];
  /** Un binome par gestionnaire de copros ESTALE (onglet « Binômes »). */
  binomes: LigneBinome[];
  /** Dossiers de binome qu'on peut viser a la main (« Ranger ailleurs »). */
  dossiers: DossierChoisissable[];
  /** Collaborateurs designables comme assistant. */
  collaborateurs: Collaborateur[];
  /** Mails que l'equipe a deplaces a la main dans Outlook depuis le dernier affichage. */
  corrigesOutlook: number;
  /** true = l'ecriture dans la boite est coupee : les rangements sont simules. */
  simulation: boolean;
  /** Message lisible si la boite ou ESTALE n'a pas repondu ; la page reste affichable. */
  erreur: string | null;
}

const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000;


export async function lireFileATrier(): Promise<FileATrier | null> {
  const boite = boiteTriConfiguree();
  if (!boite) return null;

  // D'abord suivre ce que l'equipe a fait dans Outlook : un mail remis dans la generique
  // doit reapparaitre dans la file des cet affichage.
  let corrigesOutlook = 0;
  let erreurReconciliation: string | null = null;
  try {
    const bilan = await reconcilierRangements();
    corrigesOutlook = bilan.remisEnFile + bilan.deplaces;
  } catch (e) {
    erreurReconciliation = "La vérification des mails déplacés dans Outlook n'a pas abouti.";
    console.error("[tri-emails] reconciliation :", e instanceof Error ? e.message : e);
  }

  const repo = getTriRepository();
  const [refRes, mailsRes, iniRes, binRes, journalRes, gestRes] = await Promise.allSettled([
    getReferentielTriProvider().charger(),
    getIngestionTri().lireRecents({ email: boite, max: MAX_FILE, ...(debutTri() ? { depuis: debutTri()! } : {}) }),
    listerCollaborateurs(),
    repo.binomes(),
    repo.journalDepuis(boite, new Date(Date.now() - SEPT_JOURS_MS).toISOString()),
    listerGestionnairesCabinet(),
  ]);

  const erreurs: string[] = erreurReconciliation ? [erreurReconciliation] : [];
  if (refRes.status === "rejected") erreurs.push("Ni ESTALE ni le référentiel Crypto n'ont répondu : les suggestions sont indisponibles.");
  if (refRes.status === "fulfilled") erreurs.push(...(refRes.value.avertissements ?? []));
  if (mailsRes.status === "rejected") {
    // Cas attendu tant que la boite n'existe pas ou n'est pas dans l'Access Policy (403/404).
    erreurs.push(`La boîte ${boite} n'est pas lisible pour l'instant (boîte absente ou pas encore autorisée).`);
    console.error("[tri-emails] lecture de la boite :", mailsRes.reason instanceof Error ? mailsRes.reason.message : mailsRes.reason);
  }
  if (refRes.status === "rejected") {
    console.error("[tri-emails] referentiel :", refRes.reason instanceof Error ? refRes.reason.message : refRes.reason);
  }

  const ref = refRes.status === "fulfilled" ? refRes.value : { copros: [], expediteurs: {} };
  const collaborateurs = iniRes.status === "fulfilled" ? iniRes.value : [];
  const initiales: Record<string, string> = {};
  for (const c of collaborateurs) if (c.initiales) initiales[c.email] = c.initiales;
  const binomes = binRes.status === "fulfilled" ? binRes.value : AUCUN_BINOME;
  const gestionnaires = gestRes.status === "fulfilled" ? gestRes.value : [];
  const journal = journalRes.status === "fulfilled" ? journalRes.value : [];
  if (journalRes.status === "rejected") erreurs.push("Le journal du tri est indisponible.");
  const tous = mailsRes.status === "fulfilled" ? mailsRes.value : [];
  const ranges = await repo.dejaRanges(boite, tous.map((m) => m.internetMessageId)).catch(() => new Set<string>());
  const bruts = tous.filter((m) => !ranges.has(m.internetMessageId));

  const mails: MailDeLaFile[] = bruts.map((m) => {
    const texte = m.bodyText.replace(/\r\n/g, "\n").trim();
    const base: MailATrier = {
      id: m.id,
      internetMessageId: m.internetMessageId,
      ...(m.conversationId ? { conversationId: m.conversationId } : {}),
      deNom: m.fromName ?? m.from,
      deAdresse: m.from,
      objet: m.subject || "(sans objet)",
      recuLe: m.receivedAt,
      apercu: texte.slice(0, APERCU),
      aPiecesJointes: m.attachments.length > 0,
      ...(m.webLink ? { lienOutlook: m.webLink } : {}),
    };
    return {
      ...base,
      suggestion: suggererCopro({ ...base, apercu: texte.slice(0, TEXTE_ANALYSE) }, ref),
    };
  });

  const lignes = lignesBinomes(gestionnaires, ref.copros, binomes, initiales);
  const copros: CoproDeLaFile[] = ref.copros.map((c) => ({ ...c, destination: destinationDe(c, initiales, binomes) }));

  return {
    boite,
    mails,
    copros,
    journal,
    binomes: lignes,
    dossiers: dossiersChoisissables(lignes),
    collaborateurs,
    corrigesOutlook,
    simulation: rangementSimule(boite),
    erreur: erreurs.length ? erreurs.join(" ") : null,
  };
}
