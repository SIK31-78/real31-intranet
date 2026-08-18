// Domaine PUR du RGD (Releve General des Depenses) - bloc B de la reprise comptable.
//
// Le RGD est le SEUL document qui porte TVA et parts recuperable/deductible : le grand
// livre ne les a pas, et l'import classe 6 (createEntryExpert) en a besoin (champs vat /
// recoverable / deductible natifs). Il porte aussi la CLE de repartition de chaque depense
// (les sections du document : "Charges generales", "Tantiemes CHARGES BATIMENT - A"...),
// introuvable ailleurs.
//
// Filet de verification (meme discipline que le grand livre) : chaque compte imprime son
// total, chaque section aussi, et le Total general doit egaler la classe 6 de la balance
// (mesure S0303 : 7 886,79 EUR au centime). La reconciliation locale dit OU chercher.

/** Une depense du RGD (une ligne du document). Montant SIGNE : un avoir est negatif. */
export interface DepenseRgd {
  /** Date normalisee JJ/MM/AAAA (extraireDate) ; "" si illisible - la reconciliation le verra. */
  date: string;
  /** Compte de classe 6 tel qu'imprime (ex. "602001", "622"). */
  compte: string;
  /** Intitule du compte imprime dans son en-tete (PII possible : jamais recopie en note). */
  intituleCompte?: string;
  /** Libelle de la SECTION du document = la cle de repartition ("Charges generales"...). */
  cle: string;
  /** Libelle de la ligne (fournisseur, periode...). */
  libelle: string;
  montant: number;
  /** TVA incluse / part recuperable / part deductible, si la colonne est renseignee. */
  tva?: number;
  recuperable?: number;
  deductible?: number;
}

/** Totaux imprimes captures (par compte, par section, general) - le filet de controle. */
export interface TotalImprimeRgd {
  /** "compte:602001", "section:Charges generales", "general". */
  portee: string;
  montant: number;
  tva?: number;
  recuperable?: number;
  deductible?: number;
}

export interface ResultatParsageRgd {
  depenses: DepenseRgd[];
  totaux: TotalImprimeRgd[];
  /** Notes de diagnostic PII-free (compteurs, pages, exclusions). */
  notes: string[];
}

/** Un ecart de reconciliation : la somme des lignes ne retombe pas sur le total imprime. */
export interface EcartRgd {
  portee: string;
  champ: "montant" | "tva" | "recuperable" | "deductible";
  attendu: number;
  obtenu: number;
}

const TOL = 0.005;

function arrondi(n: number): number {
  return Math.round(n * 100) / 100;
}

function sommes(depenses: readonly DepenseRgd[]) {
  let montant = 0;
  let tva = 0;
  let recuperable = 0;
  let deductible = 0;
  for (const d of depenses) {
    montant += d.montant;
    tva += d.tva ?? 0;
    recuperable += d.recuperable ?? 0;
    deductible += d.deductible ?? 0;
  }
  return { montant: arrondi(montant), tva: arrondi(tva), recuperable: arrondi(recuperable), deductible: arrondi(deductible) };
}

/**
 * Confronte les depenses parsees aux totaux IMPRIMES (compte, section, general), champ par
 * champ. Un total imprime sans le champ (TVA absente) n'est pas controle sur ce champ.
 * Pur : meme entree => meme sortie. C'est le meme principe que verifierTotauxParCompte du
 * grand livre : l'ecart est LOCALISE, on sait ou chercher.
 */
export function verifierTotauxRgd(
  depenses: readonly DepenseRgd[],
  totaux: readonly TotalImprimeRgd[],
): { controles: number; enEcart: EcartRgd[] } {
  const enEcart: EcartRgd[] = [];
  let controles = 0;

  for (const t of totaux) {
    let cibles: DepenseRgd[];
    if (t.portee === "general") cibles = [...depenses];
    else if (t.portee.startsWith("compte:")) {
      const compte = t.portee.slice("compte:".length);
      cibles = depenses.filter((d) => d.compte === compte);
    } else {
      const cle = t.portee.slice("section:".length);
      cibles = depenses.filter((d) => d.cle === cle);
    }
    const s = sommes(cibles);
    controles += 1;

    const verifier = (champ: EcartRgd["champ"], attendu: number | undefined, obtenu: number) => {
      if (attendu === undefined) return;
      if (Math.abs(attendu - obtenu) > TOL) enEcart.push({ portee: t.portee, champ, attendu, obtenu });
    };
    verifier("montant", t.montant, s.montant);
    verifier("tva", t.tva, s.tva);
    verifier("recuperable", t.recuperable, s.recuperable);
    verifier("deductible", t.deductible, s.deductible);
  }

  return { controles, enEcart };
}
