// Remplissage du gabarit de contrat de syndic : les placeholders `[Xxx]` -> les valeurs.
// Portage de la table `replacements` de l'Office Script `ContratReplace` (MYTHEC).
// Pur, deterministe, sans dependance.

import { siegeAgence } from "@/lib/domain/salles-reunion";
import type { ChampsContrat, PrestationContrat } from "./champs-contrat";
import { htDepuisTtc, ttcBrut } from "./montants-contrat";

/**
 * Nom de la prestation DANS LES PLACEHOLDERS, quand il differe de son identifiant en base.
 * Le gabarit ecrit `[CsSuppHT]` la ou `intranet_tarifs` porte `CSSupp` : un seul ecart,
 * mais il ferait silencieusement disparaitre deux lignes de tarif du contrat.
 */
const NOM_PLACEHOLDER: Partial<Record<PrestationContrat, string>> = {
  CSSupp: "CsSupp",
};

/** "2026-07-01" -> "01/07/2026". Le gabarit attend des dates francaises. */
function jjmmaaaa(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

/** Un nombre absent s'imprime "0", jamais "null" ni une case vide sur un contrat. */
function nombre(v: number | null | undefined): string {
  return v === null || v === undefined ? "0" : String(v);
}

/**
 * Table de remplacement complete : les 65 placeholders du gabarit.
 * Identique a celle du legacy, y compris le fait que le forfait timbres et les honoraires
 * TTC sont injectes bruts (sans mise en forme francaise) - c'est ainsi que les contrats
 * deja signes sont ecrits.
 */
export function tableRemplacement(champs: ChampsContrat): Record<string, string> {
  const { copro } = champs;
  const table: Record<string, string> = {
    "[Coproprietes.Adresse1]": copro.adresse1,
    "[Coproprietes.Adresse2]": copro.adresse2,
    "[Coproprietes.Adresse3]": copro.adresse3,
    "[Coproprietes.CP]": copro.codePostal,
    "[Coproprietes.Ville]": copro.ville,
    "[Coproprietes.RegistreNumero]": copro.immatriculation,
    "[Coproprietes.DateAssurance]": jjmmaaaa(copro.assuranceDateISO),
    "[Coproprietes.Assurance]": copro.assurance,
    "[Coproprietes.Agence]": siegeAgence(copro.agence),
    "[Coproprietes.NbVisite]": nombre(copro.nbVisites),
    "[Coproprietes.DureeAG]": nombre(copro.dureeAgHeures),
    "[Coproprietes.NbCS]": nombre(copro.nbCs),
    "[Coproprietes.DureeCS]": nombre(copro.dureeCsHeures),
    "[Coproprietes.NbLot]": nombre(copro.lotsPrincipaux),
    "[Coproprietes.NbAutreLot]": nombre(copro.lotsAutres),
    "[Coproprietes.FinMaxAG]": nombre(copro.finMaxAgHeure),
    "[DateAG]": jjmmaaaa(champs.dateAgISO),
    "[DebutContrat]": jjmmaaaa(champs.debutISO),
    "[FinContrat]": jjmmaaaa(champs.finISO),
    "[DureeContrat]": champs.dureeTexte,
    "[HonoGestionHT]": champs.honorairesGestionHt,
    "[FormulaireContratSyndic.HonoGestion]": String(champs.honorairesGestionTtc),
    "[FormulaireContratSyndic.FraisPostaux]": String(champs.forfaitPostauxTtc),
  };

  for (const tarif of champs.tarifs) {
    const nom = NOM_PLACEHOLDER[tarif.identifiant] ?? tarif.identifiant;
    table[`[${nom}HT]`] = tarif.ht;
    table[`[Tarifs.Tarif.${nom}]`] = tarif.ttcTexte;
  }
  return table;
}

/**
 * Remplace les placeholders d'un texte. Un placeholder INCONNU est laisse tel quel,
 * visible a l'ecran : mieux vaut un `[Xxx]` qui saute aux yeux a la relecture qu'un trou
 * silencieux dans un document contractuel.
 */
export function remplirTexte(
  texte: string,
  table: Record<string, string>,
  options: { fraisPostauxReels?: boolean } = {},
): string {
  let source = corrigerGabarit(texte, options);
  if (options.fraisPostauxReels) source = varianteFraisReels(source);
  if (assuranceInconnue(table)) source = source.split(ASSURANCE_DETAIL).join("");
  return source.replace(/\[[^\]\n]+\]/g, (placeholder) => table[placeholder] ?? placeholder);
}

/**
 * Corrections du modele Word, appliquees AU RENDU pour survivre a une regeneration du gabarit
 * depuis le classeur. § 7.1.1 : le modele disait les frais d'affranchissement « inclus dans la
 * rémunération forfaitaire » alors que le § 7.1.5 facture un forfait de frais postaux (ou le
 * reel) - coquille relevee par le patron le 17/09/2026, phrase corrigee validee par Sekou.
 */
const COQUILLE_7_1_1 =
  "Les frais de reprographie, les frais d’affranchissement et les frais administratifs afférents aux prestations du forfait sont inclus dans la rémunération forfaitaire.";
const CORRECTION_7_1_1_FORFAIT =
  "Les frais de reprographie et les frais administratifs afférents aux prestations du forfait sont inclus dans la rémunération forfaitaire ; les frais d’affranchissement font l’objet du forfait de frais postaux prévu au 7.1.5.";
const CORRECTION_7_1_1_REEL =
  "Les frais de reprographie et les frais administratifs afférents aux prestations du forfait sont inclus dans la rémunération forfaitaire ; les frais d’affranchissement sont refacturés au réel, sur justificatif.";

export function corrigerGabarit(texte: string, options: { fraisPostauxReels?: boolean } = {}): string {
  return texte.split(COQUILLE_7_1_1).join(options.fraisPostauxReels ? CORRECTION_7_1_1_REEL : CORRECTION_7_1_1_FORFAIT);
}

/**
 * Assurance du syndicat inconnue (une offre a un prospect, une fiche App A vide) : la
 * phrase s'arrete a « Titulaire d'un contrat d'assurance responsabilité civile », sans
 * « souscrit le … auprès de : … » a trous (Sekou, 16/09/2026).
 */
const ASSURANCE_DETAIL = " souscrit le [Coproprietes.DateAssurance] auprès de : [Coproprietes.Assurance]";

export function assuranceInconnue(table: Record<string, string>): boolean {
  return !table["[Coproprietes.Assurance]"]?.trim() && !table["[Coproprietes.DateAssurance]"]?.trim();
}

/**
 * Les trois phrases du § 7.1.5 qui changent quand les frais postaux sont au REEL, telles
 * qu'elles sont dans le modele Word du patron (« CONTRAT DE SYNDIC 2026_ReelFraisPostaux »,
 * compare phrase a phrase au gabarit le 15/09/2026 : rien d'autre ne differe).
 * Une variante du gabarit, pas un second gabarit : le jour ou le texte legal bouge, il
 * bouge une fois.
 */
const VARIANTE_FRAIS_REELS: readonly [forfait: string, reel: string][] = [
  [
    " € toutes taxes comprises plus frais postaux de [FormulaireContratSyndic.FraisPostaux] €. Cette rémunération",
    " € toutes taxes comprises. Cette rémunération",
  ],
  [
    "\nLe forfait de frais postaux est réduit de 10 € pour chaque copropriétaire optant pour la lettre recommandée électronique et de 3 € pour chaque copropriétaire optant pour l’envoi des appels de fonds par mail. \n",
    "\n",
  ],
  [
    "L’envoi des documents afférents aux prestations du forfait ne donne pas lieu à remboursement au syndic des frais d’affranchissement ou d’acheminement engagés, au-delà du forfait indiqué ci-dessus.",
    "L’envoi des documents afférents aux prestations du forfait donne lieu à remboursement au syndic des frais d’affranchissement ou d’acheminement engagés.",
  ],
];

export function varianteFraisReels(texte: string): string {
  let t = texte;
  for (const [forfait, reel] of VARIANTE_FRAIS_REELS) t = t.split(forfait).join(reel);
  return t;
}

/** Les placeholders d'un texte qu'on ne sait PAS remplir. Sert au controle de rendu. */
export function placeholdersNonResolus(texte: string, table: Record<string, string>): string[] {
  return [...texte.matchAll(/\[[^\]\n]+\]/g)]
    .map((m) => m[0])
    .filter((p) => table[p] === undefined);
}

export { htDepuisTtc, ttcBrut };
