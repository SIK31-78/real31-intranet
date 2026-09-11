// Service : rassemble tout ce qu'il faut pour imprimer un contrat de syndic.
//
// Portage du flow PowerApps `[REAL] Generation du contrat de syndic` (MYTHEC). Le flow
// faisait 22 lectures de tarif une par une puis deleguait le remplissage a un Office
// Script sur un classeur Excel ; ici on lit le bareme en UNE fois et le document est un
// composant React. La logique metier, elle, est dans `domain/contrat` et reste pure.
//
// Passe par le routeur (ADR-001).

import { getFacturationRepository } from "@/lib/adapters/router";
import { codeAgence } from "@/lib/services/agences/resoudre-agence";
import { cycleSuivant } from "@/lib/domain/contrat/cycle-contrat";
import {
  assemblerChampsContrat,
  PRESTATIONS_CONTRAT,
  type ChampsContrat,
  type CoproContrat,
  type PrestationContrat,
} from "@/lib/domain/contrat/champs-contrat";

/** Ce que l'appelant peut imposer, sinon tout est deduit du referentiel. */
export interface OptionsContrat {
  /** Date de l'AG qui ouvre le cycle, ISO. Defaut : la prochaine AG connue, sinon le debut du cycle. */
  dateAgISO?: string;
  /** Honoraires annuels TTC. Defaut : ceux du contrat en cours. */
  honorairesGestionTtc?: number;
  /** Forfait timbres annuel TTC. Defaut : celui du contrat en cours. */
  forfaitPostauxTtc?: number;
}

/**
 * Champs du contrat de syndic a venir pour une copropriete.
 *
 * LEVE, jamais de valeur par defaut silencieuse, sur : copro inconnue, mandat sans date
 * de fin (impossible d'enchainer un cycle), contrat de gestion absent (pas d'honoraires),
 * prestation manquante au bareme. C'est le durcissement assume face a PowerApps, qui
 * imprimait « 0,00 € » sur une ligne de tarif absente sans rien signaler - sur un
 * document contractuel signe par le syndicat.
 */
export async function getContrat(
  coproCode: string,
  options: OptionsContrat = {},
): Promise<ChampsContrat> {
  const repo = getFacturationRepository();
  const [donnees, parametres, contratCourant] = await Promise.all([
    repo.getDonneesContrat(coproCode),
    repo.getParametresCopro(coproCode),
    repo.getDernierContrat(coproCode),
  ]);

  if (!donnees) throw new Error(`Contrat de syndic : copropriete ${coproCode} introuvable.`);
  if (!donnees.finMandatISO) {
    throw new Error(
      `Contrat de syndic : la copropriete ${coproCode} n'a pas de fin de mandat au referentiel, ` +
        `impossible de calculer le cycle suivant.`,
    );
  }

  const cycle = cycleSuivant(donnees.finMandatISO);
  const anneeBareme = Number(cycle.debut.slice(0, 4));

  // Le bareme en UNE lecture, puis on exige les 21 prestations du contrat.
  const lignes = await repo.listerBareme(anneeBareme);
  const parIdentifiant = new Map(lignes.map((l) => [l.identifiantPrestation, l]));
  const manquantes = PRESTATIONS_CONTRAT.filter((p) => !parIdentifiant.has(p));
  if (manquantes.length > 0) {
    throw new Error(
      `Contrat de syndic : bareme ${anneeBareme} incomplet, prestations absentes (${manquantes.join(", ")}). ` +
        `Completer intranet_tarifs avant d'editer le contrat.`,
    );
  }
  const tarifs = {} as Record<PrestationContrat, { libelle: string; ttc: number }>;
  for (const p of PRESTATIONS_CONTRAT) {
    const l = parIdentifiant.get(p)!;
    tarifs[p] = { libelle: l.libelle, ttc: l.montantTtc };
  }

  const honoraires = options.honorairesGestionTtc ?? contratCourant?.honorairesGestionTtc;
  if (honoraires === undefined) {
    throw new Error(
      `Contrat de syndic : aucun honoraire de gestion connu pour ${coproCode}. ` +
        `Le renseigner dans le suivi des contrats, ou le saisir a l'edition.`,
    );
  }

  const copro: CoproContrat = {
    code: donnees.code,
    nom: donnees.nom,
    // Les champs d'adresse absents deviennent des chaines vides : le document imprime
    // une ligne vide, il ne doit jamais afficher « null ».
    adresse1: donnees.adresse1 ?? "",
    adresse2: donnees.adresse2 ?? "",
    adresse3: donnees.adresse3 ?? "",
    codePostal: donnees.codePostal ?? "",
    ville: donnees.ville ?? "",
    immatriculation: donnees.immatriculation ?? "",
    assurance: donnees.assurance ?? "",
    assuranceDateISO: donnees.assuranceDateISO ?? "",
    agence: (await codeAgence(donnees.agenceId)) ?? "",
    lotsPrincipaux: donnees.lotsPrincipaux ?? 0,
    lotsAutres: donnees.lotsAutres ?? 0,
    nbVisites: donnees.nbVisites ?? 0,
    // Les prestations incluses viennent des parametres contractuels, pas de la fiche :
    // c'est la meme source que la facturation des depassements, elles doivent coincider.
    dureeAgHeures: parametres?.dureeAgHeures ?? 0,
    nbCs: donnees.nbCs ?? 0,
    dureeCsHeures: parametres?.franchiseCsHeures ?? 0,
    finMaxAgHeure: parametres?.finMaxAgHeure ?? null,
  };

  return assemblerChampsContrat(
    copro,
    {
      // Sans date d'AG fournie, on prend le debut du cycle : le contrat reste editable
      // et le gestionnaire corrigera. Mieux qu'une date inventee.
      dateAgISO: options.dateAgISO ?? cycle.debut,
      debutISO: cycle.debut,
      finISO: cycle.fin,
      honorairesGestionTtc: honoraires,
      forfaitPostauxTtc: options.forfaitPostauxTtc ?? contratCourant?.forfaitPostauxTtc ?? 0,
    },
    tarifs,
  );
}
