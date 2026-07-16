// Service de suivi d'un dossier d'onboarding : cree, liste, met a jour les etapes,
// les anomalies, le journal, et reporte les compteurs d'un recap d'analyse. Passe par
// le port DossierRepository (persistance interchangeable : memoire aujourd'hui, Supabase
// demain). La logique reste testable avec l'adapter memoire.

import type { ComptaResume, Dossier, StatutEtape } from "@/lib/reprise/domain/dossier";
import type { VerdictRaccordement } from "@/lib/reprise/domain/controle-comptes";
import { creerDossier, reconcilierEtapes } from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import { trancherLiaison } from "@/lib/reprise/domain/liaison-comptes";
import { appliquerCorrections, resumerCorrections, type Correction } from "@/lib/reprise/domain/corrections-patrimoine";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";
import { calculerRecap, type RecapPatrimoine } from "./orchestrateur-patrimoine";

/**
 * Reconcilie les etapes persistees avec la checklist COURANTE (migration douce, sans perte).
 * Applique a chaque lecture : un dossier a l'ancienne nomenclature (P/V/C) se rehydrate sur la
 * checklist reelle (R1..R11) et, des la premiere mutation, se repersiste migre. Idempotent.
 */
function migrer(d: Dossier): Dossier {
  d.etapes = reconcilierEtapes(d.etapes);
  return d;
}

/** Erreur si le dossier n'existe pas (evite les mutations silencieuses). */
async function exiger(repo: DossierRepository, ref: string): Promise<Dossier> {
  const d = await repo.obtenir(ref);
  if (!d) throw new Error(`Dossier introuvable : ${ref}`);
  return migrer(d);
}

export async function creerDossierSuivi(
  repo: DossierRepository,
  ref: string,
  nomUsuel: string,
  adresse?: string,
): Promise<Dossier> {
  if (await repo.obtenir(ref)) throw new Error(`Dossier deja existant : ${ref}`);
  const d = creerDossier(ref, nomUsuel, adresse);
  await repo.sauver(d);
  return d;
}

export async function listerDossiers(repo: DossierRepository): Promise<Dossier[]> {
  const dossiers = await repo.lister();
  return dossiers.map(migrer).sort((a, b) => a.ref.localeCompare(b.ref));
}

export async function obtenirDossier(repo: DossierRepository, ref: string): Promise<Dossier | null> {
  const d = await repo.obtenir(ref);
  return d ? migrer(d) : null;
}

/** Met a jour le statut d'une etape (par code, ex. "P3"). */
export async function majEtape(
  repo: DossierRepository,
  ref: string,
  codeEtape: string,
  statut: StatutEtape,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  const etape = d.etapes.find((e) => e.code === codeEtape);
  if (!etape) throw new Error(`Etape inconnue : ${codeEtape} (dossier ${ref})`);
  etape.statut = statut;
  await repo.sauver(d);
  return d;
}

/**
 * Archive / desarchive un dossier (reversible). Le flag vit dans le JSONB `compteurs` (ADDITIF,
 * zero SQL) : on le pose (true) ou on l'efface (undefined au desarchivage, pour garder le JSONB
 * propre). Journalise le geste (date fournie par l'appelant, domaine sans horloge).
 */
export async function archiverDossier(
  repo: DossierRepository,
  ref: string,
  archive: boolean,
  nowISO: string,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, archive: archive ? true : undefined };
  d.journal.push({ date: nowISO, texte: archive ? "Dossier archive." : "Dossier desarchive." });
  await repo.sauver(d);
  return d;
}

/**
 * Supprime DEFINITIVEMENT un dossier de reprise ET les fiches de renseignements liees (hard delete,
 * irreversible). Renvoie le nombre de fiches parties (pour l'annoncer). Le jeu de donnees, les
 * compteurs, le journal et les etapes disparaissent avec le dossier. AUCUNE mutation eStale (une
 * copro deja injectee dans eStale n'est PAS touchee : on ne supprime que le suivi de reprise).
 */
export async function supprimerDossierEtFiches(
  dossierRepo: DossierRepository,
  fichesRepo: FicheRenseignementsRepository,
  ref: string,
): Promise<{ fichesSupprimees: number }> {
  const fichesSupprimees = await fichesRepo.supprimerParDossier(ref);
  await dossierRepo.supprimer(ref);
  return { fichesSupprimees };
}

export async function ajouterAnomalie(repo: DossierRepository, ref: string, texte: string): Promise<Dossier> {
  const d = await exiger(repo, ref);
  if (!d.anomalies.includes(texte)) d.anomalies.push(texte);
  await repo.sauver(d);
  return d;
}

export async function ajouterJournal(
  repo: DossierRepository,
  ref: string,
  date: string,
  texte: string,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.journal.push({ date, texte });
  await repo.sauver(d);
  return d;
}

/**
 * Reporte le resultat d'une analyse (recap) dans le dossier : compteurs + anomalies
 * actionnables (notes d'extraction + avertissements des auto-checks). Ne touche PAS aux
 * statuts d'etapes (rester conforme au perimetre : une case cochee = fait et verifie).
 */
export async function appliquerRecap(
  repo: DossierRepository,
  ref: string,
  recap: RecapPatrimoine,
): Promise<Dossier> {
  const d = await exiger(repo, ref);
  d.compteurs = {
    ...d.compteurs,
    nbLots: recap.lots.total,
    nbCles: recap.cles.length,
    nbCoproprietaires: recap.owners.total,
    nbAttributions: recap.attributions.total,
    nbAnomalies: recap.checks.erreurs.length + recap.checks.warnings.length,
  };
  const nouvelles = [...recap.notes, ...recap.checks.warnings.map((w) => w.message)];
  for (const a of nouvelles) if (!d.anomalies.includes(a)) d.anomalies.push(a);
  await repo.sauver(d);
  return d;
}

/**
 * Persiste le jeu de donnees extrait dans le dossier, pour rehydrater la fiche a
 * l'ouverture SANS re-analyser. Tolerant a la degradation cote adapter : si la colonne
 * n'existe pas encore (ALTER pas lance), l'ecriture est un no-op silencieux et l'analyse
 * marche quand meme (les compteurs restent, seul le detail du jeu n'est pas conserve).
 */
export async function enregistrerJeu(
  repo: DossierRepository,
  ref: string,
  jeu: JeuDeDonnees,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.jeu = jeu;
  await repo.sauver(d);
}

/**
 * Persiste le resume de la reprise comptable dans les compteurs du dossier (loge dans le JSONB
 * `compteurs` deja persiste : zero migration). Sert a rehydrater le bloc compta du recap GO/STOP.
 *
 * `compta` = exercice CLOTURE (toujours) ; `comptaEnCours` et `raccordement` = exercice en cours +
 * controle croise (present quand un SECOND grand livre a ete fourni). ADDITIF : passer undefined pour
 * ces deux derniers EFFACE l'ancienne valeur (un dossier repasse a un seul GL ne garde pas un croise
 * perime). Retro-compat : un appel a un seul argument (mono-GL) efface proprement en cours/croise.
 */
export async function enregistrerComptaResume(
  repo: DossierRepository,
  ref: string,
  compta: ComptaResume,
  comptaEnCours?: ComptaResume,
  raccordement?: VerdictRaccordement,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, compta, comptaEnCours, raccordement };
  await repo.sauver(d);
}

/**
 * Persiste (ou EFFACE) l'erreur d'extraction du grand livre dans les compteurs du dossier
 * (JSONB `compteurs`, ADDITIF, zero migration). Passer `undefined` efface l'erreur (extraction
 * reussie a la relance) pour ne pas laisser trainer une alerte perimee. PII-free.
 */
export async function enregistrerComptaErreur(
  repo: DossierRepository,
  ref: string,
  erreur: string | undefined,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, comptaErreur: erreur };
  await repo.sauver(d);
}

/**
 * Reporte le resultat COMPLET d'une analyse dans le dossier en UNE lecture + UNE ecriture
 * (audit API 2026-07-16, P1-7). La route /api/reprise/analyser enchainait appliquerRecap,
 * enregistrerComptaResume, enregistrerComptaErreur, enregistrerJeu et ajouterJournal : chacun
 * refaisait obtenir() (SELECT de toute la ligne) puis sauver() (upsert de toute la ligne, JSONB
 * `jeu` de plusieurs Mo inclus) -> jusqu'a 10 allers-retours Supabase lourds par analyse, avec
 * risque de lost-update entre les cycles. Ici : 1 obtenir() + toutes les mutations en memoire +
 * 1 sauver(). Semantique STRICTEMENT identique a la sequence d'origine :
 *   - recap -> compteurs + anomalies (sans doublon), comme appliquerRecap ;
 *   - compta (si fournie) -> compteurs.compta/comptaEnCours/raccordement (undefined EFFACE,
 *     comme enregistrerComptaResume) ;
 *   - comptaErreur appliquee UNIQUEMENT si grandLivreJoint (comme le garde de la route) ;
 *   - jeu remplace ; journal appendu.
 * Les helpers unitaires ci-dessus restent inchanges (utilises ailleurs : actions, corrections...).
 */
export async function appliquerResultatAnalyse(
  repo: DossierRepository,
  ref: string,
  resultat: {
    recap: RecapPatrimoine;
    jeu: JeuDeDonnees;
    compta?: ComptaResume;
    comptaEnCours?: ComptaResume;
    raccordement?: VerdictRaccordement;
    /** Un grand livre etait-il joint a l'analyse ? (gouverne l'ecriture/effacement de comptaErreur) */
    grandLivreJoint: boolean;
    comptaErreur?: string;
    /** Date de l'entree de journal (fournie par l'appelant, service sans horloge). */
    nowISO: string;
    journalTexte: string;
  },
): Promise<void> {
  const d = await exiger(repo, ref);

  // 1. Recap -> compteurs + anomalies (meme logique que appliquerRecap).
  reporterCompteurs(d, resultat.recap);
  const nouvelles = [...resultat.recap.notes, ...resultat.recap.checks.warnings.map((w) => w.message)];
  for (const a of nouvelles) if (!d.anomalies.includes(a)) d.anomalies.push(a);

  // 2. Resume compta (meme logique que enregistrerComptaResume : undefined efface en cours/croise).
  if (resultat.compta) {
    d.compteurs = {
      ...d.compteurs,
      compta: resultat.compta,
      comptaEnCours: resultat.comptaEnCours,
      raccordement: resultat.raccordement,
    };
  }

  // 3. Erreur d'extraction du grand livre : posee OU effacee seulement si un GL etait joint
  // (meme garde que la route ; sans GL joint on ne touche a rien).
  if (resultat.grandLivreJoint) {
    d.compteurs = { ...d.compteurs, comptaErreur: resultat.comptaErreur };
  }

  // 4. Jeu complet (rehydratation de la fiche sans re-analyse) + 5. journal.
  d.jeu = resultat.jeu;
  d.journal.push({ date: resultat.nowISO, texte: resultat.journalTexte });

  await repo.sauver(d);
}

/** Recalcule les compteurs patrimoine du dossier depuis un recap (miroir de appliquerRecap). */
function reporterCompteurs(d: Dossier, recap: RecapPatrimoine): void {
  d.compteurs = {
    ...d.compteurs,
    nbLots: recap.lots.total,
    nbCles: recap.cles.length,
    nbCoproprietaires: recap.owners.total,
    nbAttributions: recap.attributions.total,
    nbAnomalies: recap.checks.erreurs.length + recap.checks.warnings.length,
  };
}

/** Resultat d'une correction manuelle : jeu + recap recalcules (a renvoyer a l'UI) + notes. */
export interface ResultatCorrectionDossier {
  jeu: JeuDeDonnees;
  recap: RecapPatrimoine;
  /** Notes informatives PII-free (cascades, fusions, reattachements). */
  notes: string[];
}

/**
 * Applique des corrections MANUELLES au jeu persiste d'un dossier (editeur de corrections, ADR-030).
 * Relit le dossier (cloisonnement en amont via l'action), applique les corrections au domaine PUR
 * (transactionnel : tout ou rien), RE-PASSE verifierTout + detecterDoublons + calculerRecap (via
 * calculerRecap), repersiste le jeu + les compteurs, et JOURNALISE un resume PII-free (detail des
 * notes dans le journal du dossier, en base). Le recap/pretAProduire se met a jour tout seul.
 *
 * AUCUNE mutation eStale : les corrections ne touchent QUE le jeu local. Leve si le jeu est absent
 * (analyse jamais lancee) ou si une correction reference une entite inconnue (message clair).
 */
export async function corrigerJeuDossier(
  repo: DossierRepository,
  ref: string,
  corrections: Correction[],
  nowISO: string,
): Promise<ResultatCorrectionDossier> {
  const d = await exiger(repo, ref);
  if (!d.jeu) throw new Error("Aucun jeu de donnees a corriger : lance d'abord l'analyse.");
  if (corrections.length === 0) throw new Error("Aucune correction fournie.");

  const res = appliquerCorrections(d.jeu, corrections);
  if (!res.ok) throw new Error(res.erreurs.join(" | "));

  d.jeu = res.jeu;
  const recap = calculerRecap(res.jeu);
  reporterCompteurs(d, recap);

  const resume = resumerCorrections(corrections);
  const detail = res.notes.length > 0 ? ` ${res.notes.join(" ")}` : "";
  d.journal.push({
    date: nowISO,
    texte: `Correction manuelle : ${corrections.length} modification(s) (${resume}).${detail}`,
  });
  await repo.sauver(d);

  // Le resume compta (balance / nb comptes / erreur GL / en cours / controle croise) ne vit pas dans
  // le jeu : on le rehydrate depuis les compteurs persistes pour que l'UI n'ait pas a re-analyser les
  // grands livres.
  if (d.compteurs.compta) recap.compta = d.compteurs.compta;
  if (d.compteurs.comptaEnCours) recap.comptaEnCours = d.compteurs.comptaEnCours;
  if (d.compteurs.raccordement) recap.raccordement = d.compteurs.raccordement;
  if (d.compteurs.comptaErreur) recap.comptaErreur = d.compteurs.comptaErreur;

  return { jeu: res.jeu, recap, notes: res.notes };
}

/**
 * Tranche une liaison owner <-> compte 450 (revue humaine) et repersiste le jeu. Le compte choisi
 * (ou null pour "sans compte") vient d'un candidat propose. Pur cote domaine (trancherLiaison) ;
 * ce service ne fait que charger / muter / sauver. No-op propre si aucune liaison sur le dossier.
 */
export async function trancherLiaisonDossier(
  repo: DossierRepository,
  ref: string,
  ownerId: string,
  compteSource: string | null,
): Promise<LiaisonOwnerCompte[]> {
  const d = await exiger(repo, ref);
  if (!d.jeu?.liaisons450) return [];
  const liaisons = trancherLiaison(d.jeu.liaisons450, ownerId, compteSource);
  d.jeu = { ...d.jeu, liaisons450: liaisons };
  await repo.sauver(d);
  return liaisons;
}
