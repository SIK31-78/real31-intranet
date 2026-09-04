// Service : facturation de gestion courante trimestrielle (panneau comptable).
// Portage du flow legacy REALFacturationGestionCourante. Passe par le routeur.
//
// Action TRANSVERSE (toutes les copros) : l'autorisation se fait au niveau de la
// Server Action (role comptable), pas par un cloisonnement gestionnaire.
//
// FILET DE SECURITE (2026-09-04). Depuis que les factures peuvent partir VALIDEES
// chez Pennylane, une erreur de montant est comptablement engagee : plus de
// rattrapage. Le lancement n'est donc plus « tout ou rien » -- la comptable
// SELECTIONNE les lignes, et chaque ligne porte un verdict calcule contre le
// CONTRAT (cf. domain/facturation/filet-gestion-courante) :
//   - deja facturee sur ce trimestre / contrat non renseigne -> ne part pas ;
//   - sous-facturation ou surfacturation +10 % -> alerte, validable a la main ;
//   - surfacturation > +20 % -> exige que le mot « facturer » ait ete tape.
// Le service NE FAIT PAS CONFIANCE a l'ecran : il recalcule tous les verdicts
// avant d'ecrire, et refuse ce que le filet refuse.
//
// INVARIANT du filet : le montant soumis au verdict est la SOMME DES LIGNES qui
// partiront reellement chez Pennylane, pas un second passage de la formule. Une
// divergence future (surcharge manuelle, arrondi, minimum contractuel) est donc
// vue par construction.

import {
  attenduTrimestre,
  recapFournee,
  verdictLigne,
  type EntreeFilet,
  type VerdictFilet,
  type VerdictLigne,
} from "@/lib/domain/facturation/filet-gestion-courante";
import { getFacturationRepository } from "@/lib/adapters/router";
import type { LigneFactureInput, LigneGestionCourante } from "@/lib/ports/facturation-repository";
import { aujourdhuiISO } from "./bareme";
import { emettreFacturesEnAttente } from "./emettre-factures-en-attente";
import { formatEuros, formatJour } from "./format";
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
  /** Honoraires HT du trimestre (prorata inclus). */
  honorairesHt: number;
  /** Forfait de timbres du trimestre (prorata inclus, hors TVA). */
  timbres: number;
  /** Ce qui partira : somme des lignes de la facture. */
  montantHt: number;
  /** Ce que le contrat prevoit pour ce trimestre (prorata inclus). */
  attenduHt: number;
  /** Le trimestre PLEIN au contrat, avant prorata. */
  attenduPleinHt: number;
  ecartHt: number;
  ecartPct: number | null;
  verdict: VerdictLigne;
  /** Jours couverts / jours du trimestre, si la copro est reprise en cours. */
  prorataJours?: number;
  prorataJoursTrimestre?: number;
  dejaFacture: boolean;
  /** Date, format JJ/MM/AAAA, de la facture deja emise sur ce trimestre. */
  dejaFactureLe?: string;
  selectionnableEnMasse: boolean;
  selectionnableAvecAlertes: boolean;
  exigeConfirmationEcrite: boolean;
  emissible: boolean;
  /** Phrase courte a afficher sous le code copro. */
  message: string;
}

export interface ApercuGestionCourante {
  periode: string;
  /** Lignes que la comptable peut faire partir (verdicts hors doublon/contrat absent). */
  nbAFacturer: number;
  nbDejaFacturees: number;
  nbContratAbsent: number;
  /** Lignes en alerte validable (sous-facturation + surfacturation +10 %). */
  nbAlertes: number;
  /** Lignes exigeant la confirmation dactylographiee (> +20 %). */
  nbConfirmationEcrite: number;
  /** Lignes au prorata de reprise. */
  nbProrata: number;
  totalHonorairesHt: number;
  totalTimbres: number;
  totalHt: number;
  /** Libelle pret a afficher du total, ex "429 183,54 €". */
  totalHtLibelle: string;
  /** Attendu au contrat pour les memes lignes (prorata inclus). */
  totalAttenduHt: number;
  /** Trimestre plein au contrat, avant prorata. */
  totalContratPleinHt: number;
  ecartHt: number;
  lignes: LigneApercuGc[];
}

/** Les 2 lignes de facture d'un trimestre, telles qu'elles partiront. */
function lignesFacture(
  periode: string,
  honorairesHt: number,
  timbres: number,
): LigneFactureInput[] {
  return [
    {
      description: `Honoraires de gestion courante - ${periode}`,
      categorieProduit: CATEGORIE_GESTION_COURANTE,
      quantite: 1,
      prixUnitaireHt: honorairesHt,
    },
    // Les timbres sont hors champ TVA (refacturation de debours) : taux 0.
    ...(timbres > 0
      ? [
          {
            description: `Forfait de frais postaux - ${periode}`,
            categorieProduit: CATEGORIE_FORFAIT_POSTAUX,
            quantite: 1,
            prixUnitaireHt: timbres,
            tauxTva: 0,
          },
        ]
      : []),
  ];
}

/** Ce qu'on soumet au filet pour une copro : les lignes reelles + leur verdict. */
interface LignePreparee {
  base: LigneGestionCourante;
  lignes: LigneFactureInput[];
  verdict: VerdictFilet;
}

/**
 * Prepare une ligne : calcule l'attendu au contrat, en derive les lignes de
 * facture, puis soumet la SOMME de ces lignes au filet.
 *
 * Le prorata de reprise est applique au montant facture, pas seulement a
 * l'attendu : une copro prise en gestion le 11/04 ne doit pas payer un trimestre
 * plein. C'est ce que dit la regle metier ; le badge « prorata (X jours) »
 * l'explique a l'ecran, et la ligne reste conforme (aucune alerte).
 */
function preparer(base: LigneGestionCourante, periode: string): LignePreparee {
  const attendu = attenduTrimestre(base, periode);
  const lignes = lignesFacture(periode, attendu.honorairesHt, attendu.timbres);
  const montantHt = lignes.reduce((s, l) => s + l.quantite * l.prixUnitaireHt, 0);

  const entree: EntreeFilet = { ...base, montantHt };
  return { base, lignes, verdict: verdictLigne(entree, periode) };
}

/** Phrase courte affichee sous le code copro, selon le verdict. */
function messageVerdict(v: VerdictFilet, base: LigneGestionCourante): string {
  switch (v.verdict) {
    case "deja_facturee":
      return v.dejaFactureLe
        ? `Déjà facturée le ${formatJour(v.dejaFactureLe)}`
        : "Déjà facturée sur ce trimestre";
    case "contrat_absent":
      return base.honorairesAnnuelsTtc === null
        ? "Contrat non renseigné : aucun montant au contrat"
        : "Contrat à 0 € : montant non renseigné";
    case "prorata":
      return `Prorata de reprise (${v.prorata?.jours ?? 0} jours sur ${v.prorata?.joursTrimestre ?? 0})`;
    case "sous_facturation":
      return `Sous l'attendu au contrat de ${formatEuros(Math.abs(v.ecartHt))}`;
    case "alerte_10":
      return `Au-dessus du contrat de ${formatPct(v.ecartPct)} (${formatEuros(v.ecartHt)})`;
    case "alerte_20":
      return v.ecartPct === null
        ? "Aucun attendu au contrat sur ce trimestre : confirmation écrite exigée"
        : `Au-dessus du contrat de ${formatPct(v.ecartPct)} : confirmation écrite exigée`;
    default:
      return "Conforme au contrat";
  }
}

function formatPct(pct: number | null): string {
  if (pct === null) return "-";
  return `${(pct * 100).toFixed(1).replace(".", ",")} %`;
}

function versApercu(p: LignePreparee): LigneApercuGc {
  const { verdict: v } = p;
  return {
    coproCode: v.coproCode,
    honorairesHt: v.attendu.honorairesHt,
    timbres: v.attendu.timbres,
    montantHt: v.montantHt,
    attenduHt: v.attendu.totalHt,
    attenduPleinHt: v.attendu.totalPleinHt,
    ecartHt: v.ecartHt,
    ecartPct: v.ecartPct,
    verdict: v.verdict,
    ...(v.prorata
      ? { prorataJours: v.prorata.jours, prorataJoursTrimestre: v.prorata.joursTrimestre }
      : {}),
    dejaFacture: p.base.dejaFacture,
    ...(v.dejaFactureLe ? { dejaFactureLe: formatJour(v.dejaFactureLe) } : {}),
    selectionnableEnMasse: v.selectionnableEnMasse,
    selectionnableAvecAlertes: v.selectionnableAvecAlertes,
    exigeConfirmationEcrite: v.exigeConfirmationEcrite,
    emissible: v.emissible,
    message: messageVerdict(v, p.base),
  };
}

export async function apercuGestionCourante(periode: string): Promise<ApercuGestionCourante> {
  if (!periodeValide(periode)) throw new Error(`Periode invalide : ${periode} (attendu "AAAA-Tn").`);
  const repo = getFacturationRepository();
  const base = await repo.chargerGestionCourante(periode);
  const preparees = base.map((l) => preparer(l, periode));

  const lignes = preparees.map(versApercu);
  const emissibles = preparees.filter((p) => p.verdict.emissible);
  const recap = recapFournee(emissibles.map((p) => p.verdict));

  const totalHonorairesHt = emissibles.reduce((s, p) => s + p.verdict.attendu.honorairesHt, 0);
  const totalTimbres = emissibles.reduce((s, p) => s + p.verdict.attendu.timbres, 0);
  const compte = (v: VerdictLigne) => lignes.filter((l) => l.verdict === v).length;

  return {
    periode,
    nbAFacturer: emissibles.length,
    nbDejaFacturees: compte("deja_facturee"),
    nbContratAbsent: compte("contrat_absent"),
    nbAlertes: compte("sous_facturation") + compte("alerte_10"),
    nbConfirmationEcrite: compte("alerte_20"),
    nbProrata: lignes.filter((l) => l.prorataJours !== undefined).length,
    totalHonorairesHt,
    totalTimbres,
    totalHt: recap.totalHt,
    totalHtLibelle: formatEuros(recap.totalHt),
    totalAttenduHt: recap.totalAttenduHt,
    totalContratPleinHt: recap.totalContratPleinHt,
    ecartHt: recap.ecartHt,
    lignes,
  };
}

/** Ce que la comptable a explicitement retenu sur l'ecran de validation. */
export interface SelectionGc {
  /** Codes copro coches. Une copro absente de cette liste ne part pas. */
  coproCodes: string[];
  /** Codes pour lesquels le mot « facturer » a ete tape (lignes > +20 %). */
  confirmeesParEcrit?: string[];
}

export interface ResultatLancementGc {
  periode: string;
  facturesCreees: number;
  emises: number;
  enErreur: number;
  /** Lignes selectionnees que le filet a refusees, avec le motif. */
  ignorees: Array<{ coproCode: string; motif: string }>;
  erreurs: Array<{ coproCode: string; message: string }>;
}

/** Pourquoi le filet refuse une ligne pourtant selectionnee. */
function motifRefus(v: VerdictFilet, confirmees: Set<string>): string | null {
  if (v.verdict === "deja_facturee") {
    return v.dejaFactureLe
      ? `Déjà facturée le ${formatJour(v.dejaFactureLe)} pour ce trimestre.`
      : "Déjà facturée pour ce trimestre.";
  }
  if (v.verdict === "contrat_absent") {
    return "Contrat non renseigné : aucun montant à facturer.";
  }
  // Filet generique : tout ce que le domaine declare non emissible est refuse,
  // meme si aucun cas particulier ci-dessus ne l'a attrape (ex. prise en gestion
  // posterieure au trimestre : 0 EUR du, on ne cree pas de facture a 0 EUR).
  if (!v.emissible) {
    return "Rien à facturer sur ce trimestre pour cette copropriété.";
  }
  if (v.exigeConfirmationEcrite && !confirmees.has(v.coproCode)) {
    return "Surfacturation de plus de 20 % : confirmation écrite manquante.";
  }
  return null;
}

/**
 * Lance la facturation du trimestre pour les copros EXPLICITEMENT selectionnees,
 * puis emet le lot.
 *
 * Chaque copro est traitee isolement : un echec, comme un refus du filet,
 * n'interrompt pas les suivantes. Une ligne > +20 % non confirmee par ecrit est
 * simplement laissee de cote -- elle ne bloque pas la fournee.
 */
export async function lancerGestionCourante(
  periode: string,
  par: string,
  selection: SelectionGc,
): Promise<ResultatLancementGc> {
  if (!periodeValide(periode)) throw new Error(`Periode invalide : ${periode} (attendu "AAAA-Tn").`);
  const repo = getFacturationRepository();
  const base = await repo.chargerGestionCourante(periode);

  const retenus = new Set(selection.coproCodes);
  const confirmees = new Set(selection.confirmeesParEcrit ?? []);

  const resultat: ResultatLancementGc = {
    periode,
    facturesCreees: 0,
    emises: 0,
    enErreur: 0,
    ignorees: [],
    erreurs: [],
  };
  const idsCrees: string[] = [];

  // Le filet est REJOUE ici : l'ecran a pu etre calcule il y a dix minutes, et
  // c'est l'etat de la base au moment d'ecrire qui fait foi (une facture posee
  // entre-temps par une collegue doit encore bloquer le doublon).
  const preparees = base.filter((l) => retenus.has(l.coproCode)).map((l) => preparer(l, periode));

  const vus = new Set(preparees.map((p) => p.base.coproCode));
  for (const code of retenus) {
    if (!vus.has(code)) {
      resultat.ignorees.push({
        coproCode: code,
        motif: "Copropriété absente de la base facturable de ce trimestre.",
      });
    }
  }

  for (const p of preparees) {
    const refus = motifRefus(p.verdict, confirmees);
    if (refus) {
      resultat.ignorees.push({ coproCode: p.base.coproCode, motif: refus });
      continue;
    }
    try {
      const factureId = await repo.creerFacture({
        coproCode: p.base.coproCode,
        typePrestation: "gestion_courante",
        periode,
        libelle: `Gestion courante ${periode}`,
        dateFacture: aujourdhuiISO(),
        details: {
          periode,
          honorairesAnnuelsTtc: p.base.honorairesAnnuelsTtc,
          forfaitPostauxAnnuel: p.base.forfaitPostauxAnnuel,
          // Trace du filet : ce que le contrat prevoyait, et sous quel verdict la
          // facture est partie. Indispensable quand la facture est irreversible.
          attenduHt: p.verdict.attendu.totalHt,
          verdict: p.verdict.verdict,
          ...(p.verdict.prorata
            ? {
                prorataJours: p.verdict.prorata.jours,
                prorataJoursTrimestre: p.verdict.prorata.joursTrimestre,
              }
            : {}),
          ...(confirmees.has(p.base.coproCode) ? { confirmeeParEcrit: true } : {}),
        },
        par,
        lignes: p.lignes,
      });
      idsCrees.push(factureId);
      resultat.facturesCreees += 1;
    } catch (erreur) {
      resultat.enErreur += 1;
      resultat.erreurs.push({
        coproCode: p.base.coproCode,
        message: erreur instanceof Error ? erreur.message : String(erreur),
      });
    }
  }

  // On emet UNIQUEMENT les factures qu'on vient de creer : une facture laissee
  // volontairement en attente ne doit jamais partir dans un lancement de trimestre.
  const emission = await emettreFacturesEnAttente(idsCrees);
  resultat.emises = emission.emises;
  resultat.enErreur += emission.enErreur;
  for (const e of emission.erreurs)
    resultat.erreurs.push({ coproCode: e.factureId, message: e.message });

  return resultat;
}
