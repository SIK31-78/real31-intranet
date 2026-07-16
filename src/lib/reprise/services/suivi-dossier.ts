// Service de suivi d'un dossier d'onboarding : cree, liste, met a jour les etapes,
// les anomalies, le journal, et reporte les compteurs d'un recap d'analyse. Passe par
// le port DossierRepository (persistance interchangeable : memoire aujourd'hui, Supabase
// demain). La logique reste testable avec l'adapter memoire.

import type { ComptaResume, Dossier, StatutEtape } from "@/lib/reprise/domain/dossier";
import { creerDossier, reconcilierEtapes } from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees, LiaisonOwnerCompte } from "@/lib/reprise/domain/patrimoine";
import { trancherLiaison } from "@/lib/reprise/domain/liaison-comptes";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import type { RecapPatrimoine } from "./orchestrateur-patrimoine";

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
 */
export async function enregistrerComptaResume(
  repo: DossierRepository,
  ref: string,
  compta: ComptaResume,
): Promise<void> {
  const d = await exiger(repo, ref);
  d.compteurs = { ...d.compteurs, compta };
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
