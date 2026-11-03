// Service : frais postaux AU REEL des copros ESTALE, mois par mois (REA-490).
//
// Une periode = une facture ESTALE (decision Sekou du 03/11/2026) : on refacture ce que
// REAL31 a reellement paye, et une facture ESTALE ne se refacture qu'une fois par copro
// (la periode de la facture intranet porte sa reference ; un index unique le garantit).
//
// L'apercu ne fait que lire. La facturation recalcule tout cote serveur : l'ecran ne
// transmet que des choix (copros, envois, service oui/non), jamais des montants.

import { getConsommationEstaleProvider, getFacturationRepository } from "@/lib/adapters/router";
import {
  codeCoproDuDetail,
  lignesFactureFraisPostaux,
  regrouperFraisPostaux,
  type FraisPostauxPeriode,
} from "@/lib/domain/facturation/frais-postaux-reels";
import { CATEGORIE_FORFAIT_POSTAUX } from "@/lib/domain/facturation/produits";
import type { FactureEstaleRecue } from "@/lib/ports/consommation-estale-provider";
import type { StatutFacture } from "@/lib/ports/facturation-repository";
import { aujourdhuiISO } from "./bareme";
import { emettreFacturesEnAttente } from "./emettre-factures-en-attente";
import type { ResultatSaisieEstale } from "./saisir-factures-estale";

export interface DejaFacturee {
  coproCode: string;
  dateFacture: string;
  statut: StatutFacture;
}

export interface ApercuFraisPostaux {
  /** Factures ESTALE disponibles, la plus recente d'abord. */
  factures: FactureEstaleRecue[];
  /** Facture affichee ; null s'il n'y en a aucune. */
  reference: string | null;
  periode: FraisPostauxPeriode;
  /**
   * Copros au reel a la date de la facture, parmi celles qu'elle nomme ou qui ont un
   * mailing ESTALE (une copro au reel sans aucun envoi peut donc manquer).
   */
  coprosAuReel: string[];
  /** Copros deja facturees pour cette facture ESTALE (tous statuts). */
  dejaFacturees: DejaFacturee[];
}

/** Dernier jour du mois d'une date ISO "YYYY-MM-DD". */
function finDeMois(dateISO: string): string {
  const [a, m] = dateISO.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m, 0));
  return d.toISOString().slice(0, 10);
}

const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-07-01" -> « juillet 2026 » : le mois consomme, tel qu'il s'imprime sur la facture. */
export function moisDeFactureEstale(dateISO: string): string {
  return MOIS.format(new Date(`${dateISO}T00:00:00Z`));
}

export async function apercuFraisPostaux(reference?: string): Promise<ApercuFraisPostaux> {
  const estale = getConsommationEstaleProvider();
  const factures = await estale.listerFactures();
  const facture = (reference ? factures.find((f) => f.reference === reference) : factures[0]) ?? null;
  if (!facture) {
    return { factures, reference: null, periode: { parCopro: [], nonRattaches: [] }, coprosAuReel: [], dejaFacturees: [] };
  }

  const repo = getFacturationRepository();
  const [lignes, mailings, deja] = await Promise.all([
    estale.lireConsommation(facture.reference),
    estale.coprosDesMailings(),
    repo.listerFacturesDePeriode("frais_postaux", facture.reference),
  ]);

  // Copros concernees par la facture : celles nommees dans le detail et celles des mailings.
  const codes = new Set<string>();
  for (const l of lignes) {
    const c = codeCoproDuDetail(l.detail);
    if (c) codes.add(c);
  }
  for (const liste of mailings.values()) for (const c of liste) codes.add(c);

  // Regime du contrat EN VIGUEUR le mois de la facture : le dernier cycle commence avant
  // la fin du mois (S307 passe au reel le 01/10/2026, pas avant).
  const fin = finDeMois(facture.dateISO);
  const auReel: string[] = [];
  await Promise.all(
    [...codes].map(async (code) => {
      const cycles = await repo.listerCyclesContrat(code);
      const enVigueur = cycles
        .filter((c) => c.debutContrat <= fin)
        .sort((a, b) => b.debutContrat.localeCompare(a.debutContrat))[0];
      if (enVigueur?.fraisPostauxReels) auReel.push(code);
    }),
  );
  auReel.sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));

  return {
    factures,
    reference: facture.reference,
    periode: regrouperFraisPostaux(lignes, new Set(auReel), mailings),
    coprosAuReel: auReel,
    dejaFacturees: deja.map((d) => ({ coproCode: d.coproCode, dateFacture: d.dateFacture, statut: d.statut })),
  };
}

/** Choix de l'ecran pour une copro : les envois a refacturer. */
export interface SelectionFraisPostaux {
  coproCode: string;
  sourceIds: string[];
}

export interface ResultatFraisPostaux {
  creees: number;
  emises: number;
  enErreur: number;
  ignorees: Array<{ coproCode: string; motif: string }>;
  erreurs: Array<{ coproCode: string; message: string }>;
  estale: ResultatSaisieEstale;
}

/**
 * Cree puis emet une facture par copro selectionnee, pour la facture ESTALE `reference`.
 * Tout est recalcule depuis ESTALE et la base : une copro qui n'est plus au reel, un envoi
 * inconnu ou une copro deja facturee sur cette facture ESTALE sont ignores, avec le motif.
 */
export async function facturerFraisPostaux(
  reference: string,
  selections: SelectionFraisPostaux[],
  avecService: boolean,
  par: string,
): Promise<ResultatFraisPostaux> {
  const apercu = await apercuFraisPostaux(reference);
  const resultat: ResultatFraisPostaux = {
    creees: 0,
    emises: 0,
    enErreur: 0,
    ignorees: [],
    erreurs: [],
    estale: { envoyees: 0, aCodifier: 0, enAttente: 0, enErreur: 0, erreurs: [] },
  };
  const facture = apercu.factures.find((f) => f.reference === reference);
  if (!facture || apercu.reference !== reference) throw new Error(`Facture ESTALE ${reference} introuvable.`);

  const periodeLibelle = moisDeFactureEstale(facture.dateISO);
  const deja = new Set(apercu.dejaFacturees.map((d) => d.coproCode));
  const repo = getFacturationRepository();
  const ids: string[] = [];

  for (const s of selections) {
    if (deja.has(s.coproCode)) {
      resultat.ignorees.push({ coproCode: s.coproCode, motif: `Déjà facturée pour la facture ESTALE ${reference}.` });
      continue;
    }
    const copro = apercu.periode.parCopro.find((c) => c.coproCode === s.coproCode);
    if (!copro) {
      resultat.ignorees.push({ coproCode: s.coproCode, motif: "Pas au réel ou sans envoi sur cette facture ESTALE." });
      continue;
    }
    const retenus = new Set(s.sourceIds.filter((id) => copro.envois.some((e) => e.sourceId === id)));
    const lignes = lignesFactureFraisPostaux(copro, retenus, avecService, periodeLibelle);
    if (lignes.length === 0) {
      resultat.ignorees.push({ coproCode: s.coproCode, motif: "Aucun envoi retenu : rien à facturer." });
      continue;
    }
    try {
      const id = await repo.creerFacture({
        coproCode: s.coproCode,
        typePrestation: "frais_postaux",
        periode: reference,
        libelle: `Frais postaux ${periodeLibelle}`,
        dateFacture: aujourdhuiISO(),
        details: {
          factureEstale: reference,
          envois: [...retenus],
          avecService,
        },
        par,
        lignes: lignes.map((l) => ({
          description: l.description,
          categorieProduit: CATEGORIE_FORFAIT_POSTAUX,
          quantite: 1,
          prixUnitaireHt: l.prixUnitaireHtCentimes / 100,
          tauxTva: l.tauxTva,
        })),
      });
      ids.push(id);
      resultat.creees += 1;
    } catch (erreur) {
      resultat.enErreur += 1;
      resultat.erreurs.push({ coproCode: s.coproCode, message: erreur instanceof Error ? erreur.message : String(erreur) });
    }
  }

  // Emission Pennylane (« *** » pour les copros ESTALE) puis depot ESTALE en bon a payer :
  // l'entonnoir commun, comme la gestion courante.
  const emission = await emettreFacturesEnAttente(ids);
  resultat.emises = emission.emises;
  resultat.enErreur += emission.enErreur;
  for (const e of emission.erreurs) resultat.erreurs.push({ coproCode: e.factureId, message: e.message });
  resultat.estale = emission.estale;
  return resultat;
}
