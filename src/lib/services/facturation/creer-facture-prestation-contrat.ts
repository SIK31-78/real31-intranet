// Service : les prestations particulieres du contrat (16, cf. domain/facturation/
// prestations-contrat) - un seul chemin pour toutes, la ou les 5 gestes du quotidien
// gardent chacun le leur. Passe par le routeur (ADR-001).
//
// Meme discipline que les autres prestations : apercu sans ecriture, tarif de reference
// trace dans `details`, aucune facture a 0, perimetre du gestionnaire verifie. Le tarif
// vient d'abord de ce qui est FIGE au contrat, sinon du bareme de l'annee.
//
// La facture part au SYNDICAT (client Pennylane = la copro), y compris pour ce que le
// contrat impute « au seul coproprietaire concerne » : son nom figure sur la ligne, le
// syndicat refacture (modele de l'etat date, confirme par Sekou le 15/09/2026).

import { getFacturationRepository } from "@/lib/adapters/router";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { calculerPrestation, prestationContrat, type PrestationContrat } from "@/lib/domain/facturation/prestations-contrat";
import { htDepuisTtc } from "@/lib/domain/facturation/commun";
import { aujourdhuiISO, exigerTarifTtc, resoudreContexteTarifaire } from "./bareme";
import { formatEuros, formatJour } from "./format";
import type { ApercuFacturation } from "./apercu";

export interface DemandeFacturePrestationContrat {
  coproCode: string;
  /** Code du catalogue (`PRESTATIONS_CONTRAT[].code`). */
  prestation: string;
  /** Lots, coproprietaires ou heures selon le mode. */
  quantite?: number;
  /** Temps passe hors heures ouvrables (+40 %). */
  urgence?: boolean;
  /** Coproprietaire concerne (prestation imputable), ou tiers : figure sur la ligne. */
  nomClient?: string;
  /** Precision libre ajoutee au libelle (« lot 12 », « AG du 03/09 »...). */
  objet?: string;
  /** Date de la prestation, ISO. */
  datePrestation?: string;
  /**
   * Montant TTC retenu quand il differe du calcul (une AGE se negocie, comme l'etat date :
   * Mathilde, 13/10/2026). Absent = le montant calcule au bareme.
   */
  montantTtcRetenu?: number;
  par?: string;
}

interface Prepare {
  prestation: PrestationContrat;
  anneeBareme: number;
  tarifFige: boolean;
  tarifTtc: number;
  calcul: ReturnType<typeof calculerPrestation>;
  libelle: string;
  /** Ce qui est facture : le calcul, ou le montant modifie. */
  montantTtc: number;
  montantHt: number;
  modifie: boolean;
}

async function preparer(demande: DemandeFacturePrestationContrat, managerId: string): Promise<Prepare> {
  await exigerPerimetre(demande.coproCode, managerId);
  const prestation = prestationContrat(demande.prestation);
  if (!prestation) throw new Error(`Prestation inconnue : ${demande.prestation}.`);
  const repo = getFacturationRepository();
  const contexte = await resoudreContexteTarifaire(repo, demande.coproCode);
  const tarifTtc = await exigerTarifTtc(repo, prestation.identifiantPrestation, contexte);
  const calcul = calculerPrestation({
    prestation,
    tarifTtc,
    ...(demande.quantite !== undefined ? { quantite: demande.quantite } : {}),
    ...(demande.urgence ? { urgence: true } : {}),
  });
  const montantTtc = demande.montantTtcRetenu ?? calcul.montantTtc;
  const modifie = Math.abs(montantTtc - calcul.montantTtc) >= 0.005;
  const complements = [demande.objet?.trim(), demande.nomClient?.trim()].filter(Boolean);
  const libelle = complements.length > 0 ? `${prestation.libelle} - ${complements.join(" - ")}` : prestation.libelle;
  return {
    prestation,
    anneeBareme: contexte.anneeBareme,
    tarifFige: contexte.tarifsContrat?.[prestation.identifiantPrestation] !== undefined,
    tarifTtc,
    calcul,
    libelle,
    montantTtc,
    montantHt: modifie ? htDepuisTtc(montantTtc) : calcul.montantHt,
    modifie,
  };
}

export async function apercuPrestationContrat(
  demande: DemandeFacturePrestationContrat,
  managerId: string,
): Promise<ApercuFacturation> {
  const p = await preparer(demande, managerId);
  const { calcul } = p;
  return {
    typePrestation: "prestation_contrat",
    titre: p.prestation.libelle,
    coproCode: demande.coproCode,
    details: [
      ...(demande.nomClient ? [{ libelle: p.prestation.imputation === "coproprietaire" ? "Copropriétaire concerné" : "Client", valeur: demande.nomClient }] : []),
      ...(demande.objet ? [{ libelle: "Objet", valeur: demande.objet }] : []),
      ...(demande.datePrestation ? [{ libelle: "Date", valeur: formatJour(demande.datePrestation) }] : []),
      {
        libelle: p.tarifFige ? "Tarif figé au contrat" : `Tarif du barème ${p.anneeBareme}`,
        valeur: `${formatEuros(p.tarifTtc)} TTC${calcul.unite ? ` par ${calcul.unite.replace(/\(s\)|\(aux\)/g, "")}` : ""}`,
      },
      ...(calcul.unite ? [{ libelle: "Quantité", valeur: `${calcul.quantite.toLocaleString("fr-FR")} ${calcul.unite}` }] : []),
      ...(calcul.majorationPct > 0
        ? [{ libelle: "Majoration d'urgence", valeur: `+${Math.round(calcul.majorationPct * 100)} %`, accent: "fort" as const }]
        : []),
      { libelle: p.modifie ? "Montant calculé" : "Montant", valeur: `${formatEuros(calcul.montantTtc)} TTC`, ...(p.modifie ? {} : { accent: "fort" as const }) },
      // Une modification doit sauter aux yeux sur l'ecran de validation (comme l'etat date).
      ...(p.modifie ? [{ libelle: "Montant modifié", valeur: `${formatEuros(p.montantTtc)} TTC`, accent: "fort" as const }] : []),
    ],
    lignes: [{ description: p.libelle, montantHt: p.montantHt }],
    montantHt: p.montantHt,
    montantTtc: p.montantTtc,
    rienAFacturer: p.montantTtc === 0,
    ...(p.montantTtc === 0 ? { motifRienAFacturer: "Le montant retenu est nul : aucune facture ne sera créée." } : {}),
  };
}

export async function creerFacturePrestationContrat(
  demande: DemandeFacturePrestationContrat,
  managerId: string,
): Promise<{ montantHt: number; factureId: string | null }> {
  const p = await preparer(demande, managerId);
  const { calcul } = p;
  if (p.montantTtc === 0) return { montantHt: 0, factureId: null };

  const factureId = await getFacturationRepository().creerFacture({
    coproCode: demande.coproCode,
    typePrestation: "prestation_contrat",
    libelle: p.libelle,
    dateFacture: aujourdhuiISO(),
    ...(demande.datePrestation ? { datePrestation: demande.datePrestation } : {}),
    details: {
      prestation: p.prestation.code,
      identifiantPrestation: p.prestation.identifiantPrestation,
      article: p.prestation.article,
      mode: p.prestation.mode,
      imputation: p.prestation.imputation,
      anneeBareme: p.anneeBareme,
      tarifFige: p.tarifFige,
      tarifTtc: p.tarifTtc,
      quantite: calcul.quantite,
      majorationPct: calcul.majorationPct,
      // Les DEUX montants sont conserves : une modification reste auditable.
      montantTtc: calcul.montantTtc,
      montantTtcApplique: p.montantTtc,
      negocie: p.modifie,
      ...(demande.nomClient ? { nomClient: demande.nomClient } : {}),
      ...(demande.objet ? { objet: demande.objet } : {}),
    },
    ...(demande.par ? { par: demande.par } : {}),
    lignes: [
      {
        description: p.libelle,
        categorieProduit: p.prestation.categorieProduit,
        // La quantite est portee par la ligne : « 28 x 34,00 € » se lit sur la facture.
        // Montant modifie : une ligne au forfait (le prix unitaire ne voudrait plus rien dire).
        quantite: p.modifie ? 1 : calcul.quantite,
        prixUnitaireHt: p.modifie ? p.montantHt : calcul.unitaireHt,
      },
    ],
  });
  return { montantHt: p.montantHt, factureId };
}

/**
 * Pour le formulaire : les lots de la copro (pre-remplissage) et le tarif applicable.
 * Les deux sont INDEPENDANTS : une copro sans contrat de gestion (SE999, une reprise
 * pas encore actee) a quand meme ses lots ; le tarif manquant est dit, pas jete avec.
 */
export async function contextePrestationContrat(
  coproCode: string,
  codePrestation: string,
  managerId: string,
): Promise<{
  lotsPrincipaux: number | null;
  tarif: { tarifTtc: number; anneeBareme: number; tarifFige: boolean } | null;
  /** Pourquoi le tarif manque, le cas echeant. */
  erreurTarif: string | null;
}> {
  await exigerPerimetre(coproCode, managerId);
  const prestation = prestationContrat(codePrestation);
  if (!prestation) throw new Error(`Prestation inconnue : ${codePrestation}.`);
  const repo = getFacturationRepository();
  const donnees = await repo.getDonneesContrat(coproCode);
  try {
    const contexte = await resoudreContexteTarifaire(repo, coproCode);
    const tarifTtc = await exigerTarifTtc(repo, prestation.identifiantPrestation, contexte);
    return {
      lotsPrincipaux: donnees?.lotsPrincipaux ?? null,
      tarif: {
        tarifTtc,
        anneeBareme: contexte.anneeBareme,
        tarifFige: contexte.tarifsContrat?.[prestation.identifiantPrestation] !== undefined,
      },
      erreurTarif: null,
    };
  } catch (e) {
    return { lotsPrincipaux: donnees?.lotsPrincipaux ?? null, tarif: null, erreurTarif: (e as Error).message };
  }
}
