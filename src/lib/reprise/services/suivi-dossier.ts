// Service de suivi d'un dossier d'onboarding : cree, liste, met a jour les etapes,
// les anomalies, le journal, et reporte les compteurs d'un recap d'analyse. Passe par
// le port DossierRepository (persistance interchangeable : memoire aujourd'hui, Supabase
// demain). La logique reste testable avec l'adapter memoire.

import type { Dossier, StatutEtape } from "@/lib/reprise/domain/dossier";
import { creerDossier } from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import type { RecapPatrimoine } from "./orchestrateur-patrimoine";

/** Erreur si le dossier n'existe pas (evite les mutations silencieuses). */
async function exiger(repo: DossierRepository, ref: string): Promise<Dossier> {
  const d = await repo.obtenir(ref);
  if (!d) throw new Error(`Dossier introuvable : ${ref}`);
  return d;
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
  return dossiers.sort((a, b) => a.ref.localeCompare(b.ref));
}

export function obtenirDossier(repo: DossierRepository, ref: string): Promise<Dossier | null> {
  return repo.obtenir(ref);
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
