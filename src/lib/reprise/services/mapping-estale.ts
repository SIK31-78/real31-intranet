// Mapping PUR domaine reprise -> inputs eStale (aucun effet de bord, aucune I/O).
// Vit a cote du service d'injection (couche application), jamais dans le port.
//
// Tables de correspondance verifiees contre docs/estale-schema.json (2026-07-01) :
//   - Usage (domaine)     -> LotCategory (eStale)
//   - Civilite (domaine)  -> Civility    (eStale)
//
// Regle : on NE DEVINE PAS silencieusement. Toute valeur sans correspondance evidente
// produit un avertissement (voir mapUsage / mapCivilite) que le service remonte dans le
// RapportInjection ; on choisit un repli explicite (OTHER / M) plutot que d'echouer.

import type { Lot, Owner, Tantieme, Attribution, Usage, Civilite } from "@/lib/reprise/domain/patrimoine";
import type {
  LotInputEstale,
  DKInputEstale,
  OwnerInputEstale,
  AddressInputEstale,
  LotOwnerInputEstale,
  LotCategoryEstale,
  CivilityEstale,
  LotDivisionEstale,
} from "@/lib/reprise/ports/estale-ecriture-provider";
import type { Cle } from "@/lib/reprise/domain/patrimoine";

/** Un avertissement de mapping non bloquant (repli applique, a valider par un humain). */
export interface AvertissementMapping {
  code: string;
  message: string;
}

// --- Usage -> LotCategory --------------------------------------------------
// Les 6 usages du domaine ont une correspondance 1:1 evidente (memes libelles).
// Les valeurs eStale EXTERNAL / PRIMARY / SECONDARY n'ont PAS d'equivalent dans le
// domaine reprise -> jamais produites ici (le domaine ne les porte pas).
const USAGE_VERS_CATEGORY: Record<Usage, LotCategoryEstale> = {
  residential: "RESIDENTIAL",
  office: "OFFICE",
  commercial: "COMMERCIAL",
  mixed: "MIXED",
  parking: "PARKING",
  other: "OTHER",
};

// --- Civilite -> Civility --------------------------------------------------
// Correspondances directes verifiees. Les cas non triviaux (couples, indivision) :
//   "m&mme"  (M et Mme)          -> MandMME
//   "m|mme"  (M ou Mme)          -> MorMME
//   "mm"     (Messieurs)         -> MM
//   "mmes"   (Mesdames)          -> MMES
// eStale expose aussi ASL / AFUL (formes de groupement) : PAS dans la liste fermee du
// domaine -> non produites ici.
const CIVILITE_VERS_CIVILITY: Record<Civilite, CivilityEstale> = {
  m: "M",
  mme: "MME",
  mm: "MM",
  mmes: "MMES",
  "m&mme": "MandMME",
  "m|mme": "MorMME",
  doctor: "DOCTOR",
  doctors: "DOCTORS",
  master: "MASTER",
  masters: "MASTERS",
  professor: "PROFESSOR",
  professors: "PROFESSORS",
  indivision: "INDIVISION",
  inheritance: "INHERITANCE",
  sdc: "SDC",
};

/** Pays par defaut quand le domaine ne le porte pas (adresse souvent completee en P5). */
const PAYS_DEFAUT = "France";

/** Normalise une chaine pour comparaison d'adresse (minuscules, accents retires, espaces reduits). */
function normaliserAdresse(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * true si l'adresse du owner correspond a celle de la copro (meme code postal + meme
 * ville, et la voie de l'un contient celle de l'autre) : signe que le proprietaire habite
 * son propre lot. Comparaison approximative (numeros de voie type "4-6" vs "4" tolerees) :
 * sert a une DERIVATION non bloquante, jamais a une donnee certaine.
 */
export function adresseCorrespondCopro(owner: Owner, adresseCopro: AddressInputEstale): boolean {
  if (!owner.adrCodePostal || !owner.adrVille) return false;
  if (normaliserAdresse(owner.adrCodePostal) !== normaliserAdresse(adresseCopro.postcode)) return false;
  if (normaliserAdresse(owner.adrVille) !== normaliserAdresse(adresseCopro.city)) return false;
  const voieOwner = owner.adrVoie ? normaliserAdresse(owner.adrVoie) : "";
  const voieCopro = adresseCopro.street ? normaliserAdresse(adresseCopro.street) : "";
  if (!voieOwner || !voieCopro) return true; // CP + ville identiques deja un signal fort
  return voieOwner.includes(voieCopro) || voieCopro.includes(voieOwner);
}

export function mapUsage(usage: Usage, avertissements: AvertissementMapping[]): LotCategoryEstale {
  const cat = USAGE_VERS_CATEGORY[usage];
  if (!cat) {
    // Ne devrait pas arriver (Usage est une liste fermee), mais on ne devine pas :
    // repli explicite OTHER + avertissement.
    avertissements.push({
      code: "MAP_USAGE_INCONNU",
      message: `Usage "${usage}" sans correspondance LotCategory -> repli OTHER (a valider).`,
    });
    return "OTHER";
  }
  return cat;
}

export function mapCivilite(civilite: Civilite, avertissements: AvertissementMapping[]): CivilityEstale {
  const civ = CIVILITE_VERS_CIVILITY[civilite];
  if (!civ) {
    avertissements.push({
      code: "MAP_CIVILITE_INCONNUE",
      message: `Civilite "${civilite}" sans correspondance Civility -> repli M (a valider).`,
    });
    return "M";
  }
  return civ;
}

/** Lot (domaine) -> LotInput (eStale). floor/rooms/size optionnels ; type + use + num obligatoires. */
export function mapLot(lot: Lot, avertissements: AvertissementMapping[]): LotInputEstale {
  return {
    type: lot.type,
    use: mapUsage(lot.usage, avertissements),
    num: String(lot.numero),
    ...(lot.etage !== undefined ? { floor: lot.etage } : {}),
    ...(lot.escalier !== undefined ? { staircase: lot.escalier } : {}),
    ...(lot.porte !== undefined ? { door: lot.porte } : {}),
    ...(lot.surface !== undefined ? { size: lot.surface } : {}),
    ...(lot.nbPiece !== undefined ? { rooms: lot.nbPiece } : {}),
    ...(lot.commentaire ? { comment: lot.commentaire } : {}),
  };
}

/** Limite eStale sur DKInput.name (verifiee via l'UI : au-dela, l'API plante avec un message generique). */
const LIMITE_NOM_CLE = 80;
/** Limite eStale sur DKInput.comment. */
const LIMITE_COMMENTAIRE_CLE = 500;

/**
 * Cle (domaine) -> DKInput (eStale). DKInput.tantieme = TOTAL de la cle.
 * On prend totalAttendu (la somme EDD) comme total de la cle.
 *
 * GARDE-FOU : DKInput.name est limite a 80 caracteres cote eStale (au-dela, l'API renvoie
 * une erreur generique non-actionnable plutot qu'un message de validation). Si le libelle
 * depasse cette limite (l'extraction est censee deja produire un libelle court, mais un jeu
 * deja persiste peut porter un libelle plus ancien, plus verbeux), on tronque et on reporte
 * le reste dans "comment" (en le concatenant a un commentaire existant), avec avertissement.
 */
export function mapCle(cle: Cle, avertissements: AvertissementMapping[]): DKInputEstale {
  let name = cle.libelle;
  let comment = cle.commentaire;
  if (name.length > LIMITE_NOM_CLE) {
    const reste = name.slice(LIMITE_NOM_CLE).trim();
    name = name.slice(0, LIMITE_NOM_CLE).trim();
    comment = comment ? `${reste} ${comment}` : reste;
    avertissements.push({
      code: "MAP_CLE_NOM_TRONQUE",
      message: `Cle "${cle.code}" : libelle tronque a ${LIMITE_NOM_CLE} caracteres (le reste est passe en commentaire) - a valider.`,
    });
  }
  if (comment && comment.length > LIMITE_COMMENTAIRE_CLE) {
    comment = comment.slice(0, LIMITE_COMMENTAIRE_CLE);
  }
  return {
    name,
    code: cle.code,
    tantieme: cle.totalAttendu,
    ...(comment ? { comment } : {}),
  };
}

/**
 * Owner (domaine) -> { OwnerInput, AddressInput } (eStale).
 *
 * Champs eStale obligatoires ABSENTS du domaine, derives ici (a valider par un humain) :
 *   - OwnerInput.resident (Boolean!) : le domaine porte `occupant?: boolean|null` (Oui/Non/vide).
 *     On derive resident = (occupant === true). Si occupant est inconnu (null/undefined) ET
 *     l'adresse de la copro est fournie : resident = true si l'adresse postale du owner
 *     correspond a celle de l'immeuble (il habite alors son propre lot), sinon false.
 *     Dans les deux cas c'est une DERIVATION signalee (a valider), jamais une certitude.
 *   - AddressInput.postcode / city / country (String!) : le domaine les a en optionnel.
 *     Si absents, on met "" (postcode/city) et PAYS_DEFAUT (country) + avertissement : une
 *     adresse incomplete passera peut-etre le mapping mais devra etre completee avant l'injection reelle.
 *
 * Personne morale (pro) : on remplit companyName/companyForm/companySiret/companyCapital
 * depuis raisonSociale/formeJuridique/siren/capital. OwnerInput.firstname sert de
 * "representant legal" pour une societe et est OBLIGATOIRE cote eStale (verifie via l'UI :
 * une societe sans representant est refusee). Si aucun gerant/representant n'est identifie
 * (owner.prenom absent), on utilise "SERVICE SYNDIC" par defaut (convention cabinet pour les
 * bailleurs sociaux/personnes morales sans representant visible), avec avertissement.
 *
 * `adresseCopro` optionnelle : adresse de l'immeuble (AddressInput de createCondo), pour la
 * derivation resident ci-dessus. Absente -> comportement inchange (resident=false + avertissement).
 */
const REPRESENTANT_DEFAUT = "SERVICE SYNDIC";
/** Limite eStale sur AddressInput.housenumber (verifiee via l'UI : "176 BIS" -> "176 B"). */
const LIMITE_NUM_ADRESSE = 5;
export function mapOwner(
  owner: Owner,
  avertissements: AvertissementMapping[],
  adresseCopro?: AddressInputEstale,
): { owner: OwnerInputEstale; address: AddressInputEstale } {
  let resident = owner.occupant === true;
  if (owner.occupant === null || owner.occupant === undefined) {
    if (adresseCopro && adresseCorrespondCopro(owner, adresseCopro)) {
      resident = true;
      avertissements.push({
        code: "MAP_OWNER_RESIDENT_DERIVE",
        message: `Owner "${owner.id}" : occupant inconnu, adresse identique a la copro -> resident=true derive (a valider).`,
      });
    } else {
      avertissements.push({
        code: "MAP_OWNER_RESIDENT_INCONNU",
        message: `Owner "${owner.id}" : occupant inconnu -> resident=false par defaut (a valider).`,
      });
    }
  }

  let firstname = owner.prenom;
  if (owner.pro && !firstname) {
    firstname = REPRESENTANT_DEFAUT;
    avertissements.push({
      code: "MAP_OWNER_REPRESENTANT_DEFAUT",
      message: `Owner "${owner.id}" : personne morale sans representant legal identifie -> "${REPRESENTANT_DEFAUT}" utilise par defaut (a completer si le gerant est connu).`,
    });
  }

  const ownerInput: OwnerInputEstale = {
    civility: mapCivilite(owner.civilite, avertissements),
    lastname: owner.nom,
    resident,
    ...(firstname ? { firstname } : {}),
    ...(owner.naissance ? { birthDate: owner.naissance } : {}),
    ...(owner.lieuNaissance ? { birthPlace: owner.lieuNaissance } : {}),
    ...(owner.nationalite ? { birthCountry: owner.nationalite } : {}),
    ...(owner.email ? { email: owner.email } : {}),
    ...(owner.telFixe ? { phone: owner.telFixe } : {}),
    ...(owner.telPortable ? { mobile: owner.telPortable } : {}),
    ...(owner.pro && owner.raisonSociale ? { companyName: owner.raisonSociale } : {}),
    ...(owner.pro && owner.formeJuridique ? { companyForm: owner.formeJuridique } : {}),
    ...(owner.pro && owner.siren ? { companySiret: owner.siren } : {}),
    ...(owner.pro && owner.capital !== undefined ? { companyCapital: owner.capital } : {}),
  };

  const postcode = owner.adrCodePostal ?? "";
  const city = owner.adrVille ?? "";
  const country = owner.paysAdresse ?? PAYS_DEFAUT;
  if (!owner.adrCodePostal || !owner.adrVille) {
    avertissements.push({
      code: "MAP_OWNER_ADRESSE_INCOMPLETE",
      message: `Owner "${owner.id}" : adresse incomplete (postcode/city manquant) -> a completer avant injection reelle.`,
    });
  }

  let housenumber = owner.adrNum;
  if (housenumber && housenumber.length > LIMITE_NUM_ADRESSE) {
    const original = housenumber;
    housenumber = housenumber.slice(0, LIMITE_NUM_ADRESSE).trim();
    avertissements.push({
      code: "MAP_OWNER_NUM_TRONQUE",
      message: `Owner "${owner.id}" : numero de voie "${original}" tronque a ${LIMITE_NUM_ADRESSE} caracteres ("${housenumber}") - a completer/verifier.`,
    });
  }

  const addressInput: AddressInputEstale = {
    postcode,
    city,
    country,
    ...(housenumber ? { housenumber } : {}),
    ...(owner.adrVoie ? { street: owner.adrVoie } : {}),
    ...(owner.adrComplement ? { addressL2: owner.adrComplement } : {}),
  };

  return { owner: ownerInput, address: addressInput };
}

/**
 * Attribution (domaine) -> LotOwnerInput (eStale).
 *
 * Champs eStale obligatoires ABSENTS du domaine, derives ici (a valider par un humain) :
 *   - representative (Boolean!) : le domaine ne porte pas de notion de "representant" du lot.
 *     Regle appliquee : le PREMIER owner attribue a un lot est representative=true, les
 *     suivants false. (voir construireLiensLot ci-dessous, qui a le contexte multi-owners).
 *   - division (LotDivision!) : le domaine ne distingue pas pleine propriete / usufruit /
 *     nue-propriete. Repli FREEHOLD (pleine propriete) systematique + avertissement.
 *   - share (Float!) : le domaine ne porte pas de quote-part par owner. Repli : part egale
 *     entre les owners d'un meme lot (100 / N). Avertissement.
 */
export const DIVISION_DEFAUT: LotDivisionEstale = "FREEHOLD";

export function construireLiensLot(
  attributionsDuLot: Attribution[],
  ownerIdVersEstaleID: Map<string, string>,
  avertissements: AvertissementMapping[],
): LotOwnerInputEstale[] {
  const n = attributionsDuLot.length;
  if (n === 0) return [];
  const partEgale = 100 / n;
  if (n > 1) {
    avertissements.push({
      code: "MAP_LINK_SHARE_EGALE",
      message: `Lot avec ${n} owners : quote-parts reparties a egalite (${partEgale}% chacun) faute de donnee domaine (a valider).`,
    });
  }

  return attributionsDuLot.map((attr, index) => {
    const ownerID = ownerIdVersEstaleID.get(attr.ownerId);
    if (!ownerID) {
      // Coherence de cablage : l'appelant doit avoir cree l'owner avant. On signale fort.
      throw new Error(
        `construireLiensLot : owner "${attr.ownerId}" non capture (ownerID eStale introuvable) pour le lot ${attr.lot}.`,
      );
    }
    return {
      representative: index === 0,
      division: DIVISION_DEFAUT,
      share: partEgale,
      ownerID,
    };
  });
}
