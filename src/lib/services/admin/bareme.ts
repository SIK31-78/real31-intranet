// Service d'administration du bareme annuel (intranet_tarifs). Passe par le routeur.
// Reserve super-admin : la garde est dans la page et les actions, pas ici.

import { getFacturationRepository } from "@/lib/adapters/router";
import type { LigneBareme } from "@/lib/ports/facturation-repository";
import { dupliquerBareme, ecartAvecPrecedent, identifiantsManquants, motifRefusMontant, rangerBareme, type LigneBaremeRangee } from "@/lib/domain/facturation/bareme-admin";

export interface BaremeAnnee {
  annee: number;
  annees: number[];
  lignes: (LigneBaremeRangee & { ecartPourcent: number | null })[];
  manquants: string[];
  /** L'annee precedente qui a des lignes, pour les ecarts et la duplication. */
  precedente?: number;
}

export async function getBareme(annee: number): Promise<BaremeAnnee> {
  const repo = getFacturationRepository();
  const annees = await repo.listerAnneesBareme();
  const precedente = annees.filter((a) => a < annee).sort((a, b) => b - a)[0];
  const [lignes, avant] = await Promise.all([repo.listerBareme(annee), precedente ? repo.listerBareme(precedente) : Promise.resolve([] as LigneBareme[])]);
  return {
    annee,
    annees: annees.includes(annee) ? annees : [annee, ...annees].sort((a, b) => b - a),
    lignes: rangerBareme(lignes).map((l) => ({ ...l, ecartPourcent: ecartAvecPrecedent(l, avant) })),
    manquants: identifiantsManquants(lignes),
    ...(precedente ? { precedente } : {}),
  };
}

export async function enregistrerTarif(ligne: LigneBareme & { annee: number }): Promise<void> {
  const refus = motifRefusMontant(ligne.montantTtc);
  if (refus) throw new Error(refus);
  if (!/^[A-Za-z][A-Za-z0-9_]{1,60}$/.test(ligne.identifiantPrestation)) throw new Error("identifiant illisible (lettres et chiffres, sans espace)");
  await getFacturationRepository().enregistrerTarif({ ...ligne, libelle: ligne.libelle.trim() || ligne.identifiantPrestation });
}

export function supprimerTarif(annee: number, identifiantPrestation: string): Promise<void> {
  return getFacturationRepository().supprimerTarif(annee, identifiantPrestation);
}

/** Ouvre une annee en copiant la source (sans ecraser ce qui y est deja). Renvoie le nombre de lignes creees. */
export async function ouvrirAnnee(cible: number, source: number, majorationPourcent = 0): Promise<number> {
  const repo = getFacturationRepository();
  const [src, deja] = await Promise.all([repo.listerBareme(source), repo.listerBareme(cible)]);
  if (src.length === 0) throw new Error(`Le barème ${source} est vide, rien à copier.`);
  const nouvelles = dupliquerBareme(src, deja, majorationPourcent);
  for (const l of nouvelles) await repo.enregistrerTarif({ ...l, annee: cible });
  return nouvelles.length;
}
