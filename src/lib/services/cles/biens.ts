// Creer un bien hors syndic depuis le formulaire de trousseau (REA-53, ADR-049). Meme regle
// de droit que creer un trousseau : agence x activite (domain/cles/acteur.ts, REA-90).

import { getBienRepository } from "@/lib/adapters/router";
import { validerNouveauBien, type NouveauBienSaisie } from "@/lib/domain/bien";
import { AGENCES_CLES } from "@/lib/domain/cles/types";
import { MESSAGE_HORS_AGENCE, peutOperer, type Acteur } from "./contexte";
import { versBienChoix, type BienChoixService } from "./copros-choix";

export interface CreerBienInput extends NouveauBienSaisie {
  agenceCode?: string;
}

/**
 * La reference demandee existe deja a l'agence sur un bien DESACTIVE (REA-53). Rien n'est
 * ecrit : l'appelant propose de le reactiver tel qu'il est, il ne l'ecrase jamais.
 */
export class BienDesactiveError extends Error {
  constructor(readonly bien: BienChoixService) {
    super(`La référence ${bien.reference} existe déjà à l'agence ${bien.agenceCode} sur un bien désactivé.`);
  }
}

export async function creerBien(input: CreerBienInput, acteur: Acteur): Promise<BienChoixService> {
  const agenceCode = (input.agenceCode ?? acteur.agence ?? "").toUpperCase();
  if (!AGENCES_CLES.includes(agenceCode as (typeof AGENCES_CLES)[number])) throw new Error("Agence inconnue : précise l'agence du bien.");
  const v = validerNouveauBien(input);
  if (!v.ok) throw new Error(v.erreur);
  // « location » et « transaction » sont aussi des activites du perimetre : meme garde qu'un trousseau.
  if (!peutOperer(acteur, agenceCode, v.bien.activite)) throw new Error(MESSAGE_HORS_AGENCE);
  const repo = getBienRepository();
  // La liste du formulaire ne montre que les actifs : une reference prise par un bien inactif
  // se repere ici, avant l'insertion, pour proposer la reactivation plutot qu'un message faux.
  const ref = v.bien.reference.toUpperCase();
  const existant = (await repo.lister({ agenceCode, inclureInactifs: true })).find((b) => b.reference.toUpperCase() === ref);
  if (existant && !existant.actif) throw new BienDesactiveError(versBienChoix(existant));
  const bien = await repo.creer(agenceCode, v.bien, acteur.nom);
  return versBienChoix(bien);
}

/**
 * Remet en service un bien desactive, tel quel (proprietaire et adresse de l'ancien mandat
 * inchanges : la personne les corrige ensuite si le mandat a change). Meme droit que creer.
 */
export async function reactiverBien(bienId: string, acteur: Acteur): Promise<BienChoixService> {
  const repo = getBienRepository();
  const bien = await repo.get(bienId);
  if (!bien) throw new Error("Bien introuvable.");
  if (!peutOperer(acteur, bien.agenceCode.toUpperCase(), bien.activite)) throw new Error(MESSAGE_HORS_AGENCE);
  return versBienChoix(bien.actif ? bien : await repo.reactiver(bienId));
}
