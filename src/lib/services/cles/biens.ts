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

export async function creerBien(input: CreerBienInput, acteur: Acteur): Promise<BienChoixService> {
  const agenceCode = (input.agenceCode ?? acteur.agence ?? "").toUpperCase();
  if (!AGENCES_CLES.includes(agenceCode as (typeof AGENCES_CLES)[number])) throw new Error("Agence inconnue : précise l'agence du bien.");
  const v = validerNouveauBien(input);
  if (!v.ok) throw new Error(v.erreur);
  // « location » et « transaction » sont aussi des activites du perimetre : meme garde qu'un trousseau.
  if (!peutOperer(acteur, agenceCode, v.bien.activite)) throw new Error(MESSAGE_HORS_AGENCE);
  const bien = await getBienRepository().creer(agenceCode, v.bien, acteur.nom);
  return versBienChoix(bien);
}
