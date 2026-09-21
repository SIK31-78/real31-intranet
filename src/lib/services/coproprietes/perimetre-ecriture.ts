// Service : le PERIMETRE D'ECRITURE d'un collaborateur, en liste (ADR-041). Le pendant en
// booleen est copro-appartient (une copro, la garde). Ici : toutes les copros sur lesquelles
// il peut ecrire = son portefeuille, plus celles que son role et ses delegations lui
// ouvrent. Sert aux ecrans transverses (facturation, listes) pour montrer ce qu'on peut
// vraiment toucher, et au selecteur de vue « Mon agence ».
//
// Sur le chemin nominal (gestionnaire sans delegation) on ne lit que le portefeuille,
// comme avant ; le reste ne coute que quand le role ou une delegation elargit.

import { getAgenceRepository, getCoproRepository, getDelegationRepository, getGestionnaireRepository } from "@/lib/adapters/router";
import type { Copropriete } from "@/lib/domain/copropriete";
import { agencesEcriture, delegationActive, niveauEcriture, peutEcrire, type AuteurEcriture, type Delegation } from "@/lib/domain/perimetre-ecriture";

export interface PerimetreEcriture {
  auteur: AuteurEcriture;
  /** Delegations actives aujourd'hui dont il est beneficiaire. */
  delegations: Delegation[];
  /** Codes d'agence que le role lui ouvre. */
  agences: string[];
  /** Le portefeuille lui suffit : rien a elargir. */
  seulementPortefeuille: boolean;
}

/** Le profil d'ecriture d'un collaborateur : ce que son role et ses delegations lui ouvrent. */
export async function perimetreEcritureDe(userId: string): Promise<PerimetreEcriture | null> {
  const [utilisateur, delegations, agences] = await Promise.all([
    getGestionnaireRepository().findById(userId),
    getDelegationRepository().listerPourBeneficiaire(userId),
    getAgenceRepository().listerAgences(),
  ]);
  if (!utilisateur) return null;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const auteur: AuteurEcriture = {
    id: utilisateur.id,
    roleTable: utilisateur.role ?? null,
    agenceCode: utilisateur.agencyId ? (agences.find((a) => a.id === utilisateur.agencyId)?.code ?? null) : null,
    habilitations: utilisateur.habilitations ?? [],
  };
  const actives = delegations.filter((d) => delegationActive(d, aujourdHui));
  return {
    auteur,
    delegations: actives,
    agences: agencesEcriture(auteur),
    seulementPortefeuille: niveauEcriture(auteur) === "portefeuille" && actives.length === 0,
  };
}

/** Toutes les copros actives sur lesquelles ce collaborateur peut ecrire. */
export async function coprosEcrivables(userId: string): Promise<Copropriete[]> {
  const repo = getCoproRepository();
  const perimetre = await perimetreEcritureDe(userId);
  if (!perimetre || perimetre.seulementPortefeuille) return repo.list(userId);
  const [toutes, agences] = await Promise.all([repo.listerToutes(), getAgenceRepository().listerAgences()]);
  const codeDe = (id: string | undefined) => (id ? agences.find((a) => a.id === id)?.code ?? null : null);
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return toutes.filter((c) =>
    peutEcrire(
      perimetre.auteur,
      { code: c.code, managerId: c.managerId ?? null, assistantId: c.assistantId ?? null, agenceCode: codeDe(c.agenceId) },
      perimetre.delegations,
      aujourdHui,
    ),
  );
}
