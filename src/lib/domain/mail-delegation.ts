// Les délégations ouvrent les mails (complément d'ADR-041 du 27/10/2026, décision Sekou).
// Domaine pur : qui m'a confié son portefeuille aujourd'hui, et ce que ça ouvre dans
// « E-mails » et « Tous les échanges ».
//
// - Seule une délégation de PORTEFEUILLE ouvre des mails. Une délégation d'agence ou de copro
//   donne l'écriture sur des copros (ADR-041), pas la messagerie de quelqu'un : rien côté mail.
// - Active = aujourd'hui entre `depuis` et `jusqua` (bornes comprises), non clôturée.
// - Boîte partagée : les dossiers des binômes du titulaire s'ajoutent à ma distribution, et sa
//   boîte partagée à mes boîtes s'il est d'une autre agence (boites-visibles).

import { delegationActive, type Delegation } from "./perimetre-ecriture";

/** Une délégation telle que le dépôt la rend (clôturée = retirée avant terme). */
export type DelegationLue = Delegation & { clotureeLeISO?: string | null };

/** Un titulaire qui m'a confié son portefeuille, résolu dans la table des collaborateurs. */
export interface TitulaireMail {
  id: string;
  /** En minuscules. */
  email: string;
  nomComplet: string;
  agencyId?: string | null;
}

/**
 * Les titulaires (ids) dont une délégation de portefeuille vers moi est active aujourd'hui.
 * Sans doublon ; jamais moi-même (une délégation de soi à soi n'ouvre rien de plus).
 */
export function titulairesDelegantsActifs(delegations: readonly DelegationLue[], moiId: string, aujourdHuiISO: string): string[] {
  const ids = new Set<string>();
  for (const d of delegations) {
    if (d.aUserId !== moiId || d.deUserId === moiId) continue;
    if (d.portee !== "portefeuille" || d.clotureeLeISO || !delegationActive(d, aujourdHuiISO)) continue;
    ids.add(d.deUserId);
  }
  return [...ids];
}

/**
 * « Fanny SORIVELLE » -> « Fanny S. » : le prénom et l'initiale du nom, ce qu'il faut pour
 * savoir pour qui on répond. Le nom est le mot en capitales (« SORIVELLE Fanny » marche
 * aussi) ; sinon le dernier mot. Un seul mot : tel quel.
 */
export function nomCourtTitulaire(nomComplet: string): string {
  const mots = nomComplet.trim().split(/\s+/).filter(Boolean);
  if (mots.length <= 1) return mots[0] ?? "";
  const estNom = (m: string) => m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase();
  const nom = mots.find(estNom) ?? mots[mots.length - 1]!;
  const prenom = mots.filter((m) => m !== nom).join(" ");
  return `${prenom} ${nom.charAt(0).toUpperCase()}.`;
}
