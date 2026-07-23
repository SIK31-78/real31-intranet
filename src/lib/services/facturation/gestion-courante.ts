// Service : facturation de gestion courante trimestrielle (panneau comptable).
// Portage du flow legacy REALFacturationGestionCourante. Passe par le routeur.
//
// Action TRANSVERSE (toutes les copros) : l'autorisation se fait au niveau de la
// Server Action (role comptable), pas par un cloisonnement gestionnaire.
// L'idempotence est portee par la periode : relancer un trimestre deja facture
// ne double-facture pas (les copros deja facturees sont exclues).

import { calculerTrimestreGestionCourante } from "@/lib/domain/facturation/gestion-courante";
import { getFacturationRepository } from "@/lib/adapters/router";
import { aujourdhuiISO } from "./bareme";
import { emettreFacturesEnAttente } from "./emettre-factures-en-attente";
import { formatEuros } from "./format";
import {
  CATEGORIE_GESTION_COURANTE,
  CATEGORIE_FORFAIT_POSTAUX,
} from "@/lib/domain/facturation/produits";

/** Periode trimestrielle courante, ex "2026-T3" (trimestre civil). */
export function trimestreCourant(aujISO = aujourdhuiISO()): string {
  const [annee, mois] = aujISO.split("-").map(Number);
  const t = Math.floor(((mois ?? 1) - 1) / 3) + 1;
  return `${annee}-T${t}`;
}

/** Valide le format d'une periode "AAAA-Tn". */
export function periodeValide(periode: string): boolean {
  return /^\d{4}-T[1-4]$/.test(periode);
}

export interface LigneApercuGc {
  coproCode: string;
  honorairesHt: number;
  timbres: number;
  dejaFacture: boolean;
}

export interface ApercuGestionCourante {
  periode: string;
  nbAFacturer: number;
  nbDejaFacturees: number;
  totalHonorairesHt: number;
  totalTimbres: number;
  totalHt: number;
  /** Libelle pret a afficher du total, ex "429 183,54 €". */
  totalHtLibelle: string;
  lignes: LigneApercuGc[];
}

export async function apercuGestionCourante(periode: string): Promise<ApercuGestionCourante> {
  if (!periodeValide(periode)) throw new Error(`Periode invalide : ${periode} (attendu "AAAA-Tn").`);
  const repo = getFacturationRepository();
  const base = await repo.chargerGestionCourante(periode);

  const lignes: LigneApercuGc[] = base.map((l) => {
    const t = calculerTrimestreGestionCourante(
      l.honorairesAnnuelsTtc,
      l.forfaitPostauxAnnuel,
      l.fraisPostauxReels,
    );
    return {
      coproCode: l.coproCode,
      honorairesHt: t.honorairesHt,
      timbres: t.timbres,
      dejaFacture: l.dejaFacture,
    };
  });

  const aFacturer = lignes.filter((l) => !l.dejaFacture);
  const totalHonorairesHt = aFacturer.reduce((s, l) => s + l.honorairesHt, 0);
  const totalTimbres = aFacturer.reduce((s, l) => s + l.timbres, 0);
  const totalHt = totalHonorairesHt + totalTimbres;

  return {
    periode,
    nbAFacturer: aFacturer.length,
    nbDejaFacturees: lignes.length - aFacturer.length,
    totalHonorairesHt,
    totalTimbres,
    totalHt,
    totalHtLibelle: formatEuros(totalHt),
    lignes,
  };
}

export interface ResultatLancementGc {
  periode: string;
  facturesCreees: number;
  emises: number;
  enErreur: number;
  erreurs: Array<{ coproCode: string; message: string }>;
}

/**
 * Lance la facturation d'un trimestre : cree une facture par copro non encore
 * facturee (2 lignes : honoraires HT + timbres hors TVA), puis emet le lot.
 * Chaque copro est traitee isolement : un echec n'interrompt pas les suivantes.
 */
export async function lancerGestionCourante(
  periode: string,
  par: string,
): Promise<ResultatLancementGc> {
  if (!periodeValide(periode)) throw new Error(`Periode invalide : ${periode} (attendu "AAAA-Tn").`);
  const repo = getFacturationRepository();
  const base = await repo.chargerGestionCourante(periode);
  const aFacturer = base.filter((l) => !l.dejaFacture);

  const resultat: ResultatLancementGc = {
    periode,
    facturesCreees: 0,
    emises: 0,
    enErreur: 0,
    erreurs: [],
  };
  const idsCrees: string[] = [];

  for (const ligne of aFacturer) {
    try {
      const t = calculerTrimestreGestionCourante(
        ligne.honorairesAnnuelsTtc,
        ligne.forfaitPostauxAnnuel,
        ligne.fraisPostauxReels,
      );
      const lignesFacture = [
        {
          description: `Honoraires de gestion courante - ${periode}`,
          categorieProduit: CATEGORIE_GESTION_COURANTE,
          quantite: 1,
          prixUnitaireHt: t.honorairesHt,
        },
        // Les timbres sont hors champ TVA (refacturation de debours) : taux 0.
        ...(t.timbres > 0
          ? [
              {
                description: `Forfait de frais postaux - ${periode}`,
                categorieProduit: CATEGORIE_FORFAIT_POSTAUX,
                quantite: 1,
                prixUnitaireHt: t.timbres,
                tauxTva: 0,
              },
            ]
          : []),
      ];

      const factureId = await repo.creerFacture({
        coproCode: ligne.coproCode,
        typePrestation: "gestion_courante",
        periode,
        libelle: `Gestion courante ${periode}`,
        dateFacture: aujourdhuiISO(),
        details: {
          periode,
          honorairesAnnuelsTtc: ligne.honorairesAnnuelsTtc,
          forfaitPostauxAnnuel: ligne.forfaitPostauxAnnuel,
        },
        par,
        lignes: lignesFacture,
      });
      idsCrees.push(factureId);
      resultat.facturesCreees += 1;
    } catch (erreur) {
      resultat.enErreur += 1;
      resultat.erreurs.push({
        coproCode: ligne.coproCode,
        message: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }

  // On emet UNIQUEMENT les factures qu'on vient de creer : une facture laissee
  // volontairement en attente ne doit jamais partir dans un lancement de trimestre.
  const emission = await emettreFacturesEnAttente(idsCrees);
  resultat.emises = emission.emises;
  resultat.enErreur += emission.enErreur;
  for (const e of emission.erreurs) resultat.erreurs.push({ coproCode: e.factureId, message: e.message });

  return resultat;
}
