// Service : recap AG (compte-rendu post-assemblee generale).
// Passe par le routeur, jamais un adapter en direct (ADR-001).
//
// Portage de NewRecapAGScreen1/2 + du flow NotifComptable. Enchainement :
//   parametres copro (duree d'AG, plage contractuelle) -> tarif horaire de
//   l'EXERCICE APPROUVE (annee N-1 par rapport a la date d'AG) -> calcul pur
//   -> ecriture du recap + travaux -> ouverture du nouveau cycle de contrat
//   -> facture de depassement si depassement > 0.
//
// Tarif N-1 : une AG de l'annee N+1 approuve l'exercice clos au 31/12/N, on
// facture donc au tarif de cet exercice. Cf. MIGRATION_PLAN.md #2.

import { calculerDepassementAg } from "@/lib/domain/facturation/depassement-ag";
import { avertissementFondsTravaux } from "@/lib/domain/recap-ag/fonds-travaux";
import { htDepuisTtc, type Creneau } from "@/lib/domain/facturation/commun";
import {
  getFacturationRepository,
  getRecapAgRepository,
  getComptaRepository,
} from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { marquerRecapFait } from "@/lib/services/supervision-ag/auto-cochage";
import type { TravauxVotes } from "@/lib/ports/recap-ag-repository";
import { aujourdhuiISO, exigerTarifTtc } from "./bareme";
import { formatEuros, formatHeure, formatHeures, formatJour } from "./format";
import type { ApercuFacturation } from "./apercu";
import { CATEGORIE_HONORAIRES_COMPLEMENTAIRES } from "@/lib/domain/facturation/produits";

export interface DemandeRecapAg {
  /** Code copro (referenceCrypto). */
  coproCode: string;
  /** Creneau reel de l'AG. */
  assemblee: Creneau;

  comptesApprouves?: boolean;
  reserves?: string;
  budgetModifie?: boolean;
  montantBudget?: number;
  pourcentageBudget?: number;
  pptVote?: boolean;
  pourcentagePpt?: number;
  montantPpt?: number;
  fondsTravaux?: boolean;
  infoComptable?: string;

  travaux?: TravauxVotes[];

  /** Nouveau contrat ouvert par cette AG. */
  debutContrat?: string;
  honorairesGestionTtc?: number;
  /** true = frais postaux reels refactures, false = forfait annuel. */
  fraisPostauxReels?: boolean;
  forfaitPostauxTtc?: number;

  /** Initiales de l'auteur. */
  par?: string;
}

export interface ResultatRecapAg {
  recapId: string;
  depassementHeures: number;
  montantTtc: number;
  /** Null si aucun depassement : pas de facture. */
  factureId: string | null;
}

/** Annee de bareme d'un recap AG : l'exercice approuve, soit N-1. */
function anneeExerciceApprouve(jourAg: string): number {
  return Number(jourAg.slice(0, 4)) - 1;
}

/** Resout parametres, tarif et calcul. Partage par l'apercu et la creation. */
/** Alertes non bloquantes a remonter a l'ecran de validation. */
function avertissements(demande: DemandeRecapAg): string[] {
  const alerte = avertissementFondsTravaux({
    ...(demande.pptVote !== undefined ? { pptVote: demande.pptVote } : {}),
    ...(demande.pourcentageBudget !== undefined
      ? { pourcentageBudget: demande.pourcentageBudget }
      : {}),
  });
  return alerte ? [alerte] : [];
}

async function calculer(demande: DemandeRecapAg) {
  const repo = getFacturationRepository();

  const parametres = await repo.getParametresCopro(demande.coproCode);
  if (!parametres) throw new Error(`Copropriete ${demande.coproCode} introuvable.`);

  // NULL = parametre ABSENT de la fiche (inconnu), distinct d'un 0 explicite. On
  // refuse de calculer un depassement d'AG sur une duree ou une plage inconnue :
  // une duree d'AG absente ferait basculer toute l'assemblee en depassement, une
  // plage absente rendrait tout "hors plage". On leve plutot que de sur-facturer.
  // (Un 0 explicite reste valide : 0 h incluse = assemblee facturee normalement.)
  if (
    parametres.dureeAgHeures === null ||
    parametres.debutMinAgHeure === null ||
    parametres.finMaxAgHeure === null
  ) {
    throw new Error(
      `Paramètres d'AG non renseignés pour la copropriété ${demande.coproCode} ` +
        `(durée d'AG et plage horaire) — à compléter sur la fiche avant de facturer le dépassement.`,
    );
  }

  const anneeBareme = anneeExerciceApprouve(demande.assemblee.jourDebut);
  const tarifHoraireTtc = await exigerTarifTtc(repo, "TauxHoraire", anneeBareme);

  const calcul = calculerDepassementAg({
    assemblee: demande.assemblee,
    dureeAgContractuelleHeures: parametres.dureeAgHeures,
    debutMinAgHeure: parametres.debutMinAgHeure,
    finMaxAgHeure: parametres.finMaxAgHeure,
    tarifHoraireTtc,
  });

  return {
    dureeAgHeures: parametres.dureeAgHeures,
    debutMinAgHeure: parametres.debutMinAgHeure,
    finMaxAgHeure: parametres.finMaxAgHeure,
    anneeBareme,
    tarifHoraireTtc,
    calcul,
  };
}

export async function apercuRecapAg(
  demande: DemandeRecapAg,
  managerId: string,
): Promise<ApercuFacturation> {
  await exigerPerimetre(demande.coproCode, managerId);
  const { dureeAgHeures, debutMinAgHeure, finMaxAgHeure, anneeBareme, tarifHoraireTtc, calcul } =
    await calculer(demande);
  const alertes = avertissements(demande);

  const rienAFacturer = calcul.totalDepassementHeures === 0;
  const { assemblee } = demande;

  return {
    typePrestation: "depassement_ag",
    titre: "Recap AG et depassement horaire",
    coproCode: demande.coproCode,
    details: [
      {
        libelle: "Assemblee du",
        valeur: `${formatJour(assemblee.jourDebut)}, de ${formatHeure(assemblee.heureDebut, assemblee.minuteDebut)} a ${formatHeure(assemblee.heureFin, assemblee.minuteFin)}`,
      },
      { libelle: "Duree totale", valeur: formatHeures(calcul.dureeTotaleHeures) },
      {
        libelle: "Inclus au contrat",
        valeur: `${formatHeures(dureeAgHeures)} entre ${debutMinAgHeure} h et ${finMaxAgHeure} h`,
        accent: "contrat",
      },
      {
        libelle: "Depassement dans la plage",
        valeur: formatHeures(calcul.depassementDansPlageHeures),
      },
      {
        libelle: "Depassement hors plage",
        valeur: formatHeures(calcul.depassementHorsPlageHeures),
      },
      {
        libelle: "Total facturable",
        valeur: formatHeures(calcul.totalDepassementHeures),
        accent: "fort",
      },
      {
        libelle: `Tarif horaire (exercice ${anneeBareme})`,
        valeur: `${formatEuros(tarifHoraireTtc)} TTC`,
      },
      ...(demande.travaux && demande.travaux.length > 0
        ? [{ libelle: "Travaux votes", valeur: `${demande.travaux.length} poste(s)` }]
        : []),
    ],
    lignes: rienAFacturer
      ? []
      : [
          {
            description: `Depassement AG (${formatHeures(calcul.totalDepassementHeures)})`,
            montantHt: htDepuisTtc(calcul.montantTtc),
          },
        ],
    montantHt: htDepuisTtc(calcul.montantTtc),
    montantTtc: calcul.montantTtc,
    ...(alertes.length > 0 ? { avertissements: alertes } : {}),
    rienAFacturer,
    ...(rienAFacturer
      ? {
          motifRienAFacturer:
            "L'assemblee n'a pas depasse la duree ni la plage prevues au contrat : le recap sera enregistre, sans facture.",
          // Le recap est le livrable, la facture une retombee : sans depassement il
          // reste a ENREGISTRER. Sans ce libelle, la fenetre ne proposait que
          // "Fermer" et le compte-rendu etait perdu.
          actionSansFacture: "Enregistrer le récap",
        }
      : {}),
  };
}

/**
 * Enregistre le recap AG, ouvre le nouveau cycle de contrat, et facture le
 * depassement s'il y en a un.
 *
 * Le mail au comptable (flow NotifComptable) n'est PAS envoye : il depend de
 * l'integration Entra ID / Graph, bloquee DSI. Le champ notif_comptable_at
 * reste null, il tracera l'envoi le jour ou la vanne s'ouvre.
 */
export async function creerRecapAg(
  demande: DemandeRecapAg,
  managerId: string,
): Promise<ResultatRecapAg> {
  await exigerPerimetre(demande.coproCode, managerId);
  const repoFacturation = getFacturationRepository();
  const repoRecap = getRecapAgRepository();

  const agDate = demande.assemblee.jourDebut;
  if (await repoRecap.existeRecap(demande.coproCode, agDate)) {
    throw new Error(
      `Un recap existe deja pour la copropriete ${demande.coproCode} et l'AG du ${formatJour(agDate)}.`,
    );
  }

  const { anneeBareme, tarifHoraireTtc, calcul } = await calculer(demande);
  const aFacturer = calcul.totalDepassementHeures > 0;

  // Une AG ouvre un nouveau cycle de contrat (comportement du flow NotifComptable).
  let suiviContratId: string | undefined;
  if (demande.debutContrat) {
    suiviContratId = await repoFacturation.creerContrat({
      coproCode: demande.coproCode,
      debutContrat: demande.debutContrat,
      ...(demande.honorairesGestionTtc !== undefined
        ? { honorairesGestionTtc: demande.honorairesGestionTtc }
        : {}),
      ...(demande.fraisPostauxReels !== undefined
        ? { fraisPostauxReels: demande.fraisPostauxReels }
        : {}),
      ...(demande.forfaitPostauxTtc !== undefined
        ? { forfaitPostauxTtc: demande.forfaitPostauxTtc }
        : {}),
    });
  }

  const recapId = await repoRecap.creerRecapAg({
    coproCode: demande.coproCode,
    agDate,
    debutAg: instantIso(demande.assemblee, "debut"),
    finAg: instantIso(demande.assemblee, "fin"),
    ...(demande.comptesApprouves !== undefined ? { comptesApprouves: demande.comptesApprouves } : {}),
    ...(demande.reserves ? { reserves: demande.reserves } : {}),
    ...(demande.budgetModifie !== undefined ? { budgetModifie: demande.budgetModifie } : {}),
    ...(demande.montantBudget !== undefined ? { montantBudget: demande.montantBudget } : {}),
    ...(demande.pourcentageBudget !== undefined ? { pourcentageBudget: demande.pourcentageBudget } : {}),
    ...(demande.pptVote !== undefined ? { pptVote: demande.pptVote } : {}),
    ...(demande.pourcentagePpt !== undefined ? { pourcentagePpt: demande.pourcentagePpt } : {}),
    ...(demande.montantPpt !== undefined ? { montantPpt: demande.montantPpt } : {}),
    ...(demande.fondsTravaux !== undefined ? { fondsTravaux: demande.fondsTravaux } : {}),
    ...(demande.infoComptable ? { infoComptable: demande.infoComptable } : {}),
    depassementHeures: calcul.totalDepassementHeures,
    depassementTtc: calcul.montantTtc,
    travaux: demande.travaux ?? [],
    ...(suiviContratId ? { suiviContratId } : {}),
    statut: aFacturer ? "a_facturer" : "termine",
    ...(demande.par ? { par: demande.par } : {}),
  });

  // Le recap reste un PUR compte-rendu : les DATES et le jalon TENUE sont poses par
  // conclureAg (l'AG est finie), pas ici. Seule retombee cote recap : la synthese comptable
  // devient une note auto dans le fil compta - substitut au mail NotifComptable bloque DSI
  // (notif_comptable_at reste null : ce n'est PAS le mail). Best-effort (jamais bloquant).
  if (demande.infoComptable) {
    await getComptaRepository()
      .ajouterNote(demande.coproCode, agDate, "gestionnaire", demande.infoComptable, demande.par ?? "")
      .catch((e) => console.warn("[recap-ag] note compta non ajoutee :", (e as Error).message));
  }

  // Un recap existe = l'item "Récap AG" de la supervision de cette AG est fait.
  // Branchement best-effort (jamais bloquant pour le recap qui vient d'etre cree).
  await marquerRecapFait(demande.coproCode, agDate, demande.par ?? "");

  if (!aFacturer) {
    return { recapId, depassementHeures: 0, montantTtc: 0, factureId: null };
  }

  const factureId = await repoFacturation.creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "depassement_ag",
    libelle: `Depassement AG du ${formatJour(agDate)}`,
    dateFacture: aujourdhuiISO(),
    datePrestation: agDate,
    details: {
      assemblee: demande.assemblee,
      anneeBareme,
      tarifHoraireTtc,
      depassementDansPlageHeures: calcul.depassementDansPlageHeures,
      depassementHorsPlageHeures: calcul.depassementHorsPlageHeures,
      recapId,
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        // Detail affiche sur le PDF : sans le decoupage plage / hors plage, un
        // depassement d'AG est indefendable devant le conseil syndical.
        description:
          `Depassement AG du ${formatJour(agDate)}, ` +
          `de ${formatHeure(demande.assemblee.heureDebut, demande.assemblee.minuteDebut)} ` +
          `a ${formatHeure(demande.assemblee.heureFin, demande.assemblee.minuteFin)}. ` +
          `Duree totale : ${formatHeures(calcul.dureeTotaleHeures)}. ` +
          `Depassement dans la plage : ${formatHeures(calcul.depassementDansPlageHeures)}. ` +
          `Hors plage : ${formatHeures(calcul.depassementHorsPlageHeures)}.`,
        categorieProduit: CATEGORIE_HONORAIRES_COMPLEMENTAIRES,
        quantite: calcul.totalDepassementHeures,
        prixUnitaireHt: htDepuisTtc(tarifHoraireTtc),
      },
    ],
  });

  await repoRecap.rattacherFacture(recapId, factureId, "a_facturer");

  return {
    recapId,
    depassementHeures: calcul.totalDepassementHeures,
    montantTtc: calcul.montantTtc,
    factureId,
  };
}

/** Recompose un instant ISO complet a partir du creneau saisi (date + h + min). */
function instantIso(c: Creneau, borne: "debut" | "fin"): string {
  const jour = borne === "debut" ? c.jourDebut : c.jourFin;
  const h = borne === "debut" ? c.heureDebut : c.heureFin;
  const m = borne === "debut" ? c.minuteDebut : c.minuteFin;
  return `${jour}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}
