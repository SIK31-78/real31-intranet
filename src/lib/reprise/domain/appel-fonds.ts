// DOMAINE PUR du BLOC C de la reprise comptable : les APPELS DE FONDS (provisions appelees aux
// coproprietaires, classes 1/7 en comptabilite de copropriete). Types + fonctions de CONTROLE.
// Zero I/O, zero dependance technique : tout est calculable a partir de ce qu'un appel imprime.
//
// Ce que le domaine sait, et pourquoi :
//   - un appel = un coproprietaire, une periode (le trimestre appele), N lignes ;
//   - une ligne = un LOT x une NATURE de provision x une CLE de repartition -> une quote-part ;
//   - la CLE est le nerf de la reprise : c'est elle qui dit sur quelle grille de tantiemes la
//     provision a ete repartie ("Charges generales" -> cle 001, "CHARGES BATIMENT - A" -> cle 100
//     chez Matera S0303). Le rattachement du libelle imprime a un NUMERO de cle eStale n'est PAS
//     ici : c'est de la semantique d'import, elle viendra plus tard. Le domaine se contente de
//     restituer la cle TELLE QU'IMPRIMEE et de savoir regrouper dessus.
//
// PII : `reference` porte un nom de coproprietaire. Aucune fonction de ce module ne la fait
// remonter dans un resume ou un controle - les sorties de controle s'identifient par les LOTS
// (numeros), qui designent le compte sans nommer personne.

/** Une ligne de detail d'un appel : un lot, une nature de provision, une cle, une quote-part. */
export interface LigneAppelFonds {
  /** Numero de lot tel qu'imprime ("114", "101"). Vide si la colonne Lot n'a pas ete lue. */
  lot: string;
  /** Nature du lot telle qu'imprimee ("Cave", "Appartement"). Informatif. */
  natureLot?: string;
  /** Libelle complet imprime : nature + cle entre parentheses. */
  libelle: string;
  /** Nature de la provision ("Provision pour charges courantes", "... pour fonds travaux"). */
  nature: string;
  /**
   * Cle de repartition telle qu'imprimee entre parentheses ("Charges generales",
   * "Tantiemes CHARGES BATIMENT - A"). Absente si le libelle n'en portait pas -> la ligne est
   * parsee mais NON rattachable : l'aval doit la traiter comme une anomalie, pas l'ignorer.
   */
  cle?: string;
  /** Montant total reparti sur la cle pour la periode (colonne "Montant a repartir"). */
  montantARepartir?: number;
  /** Tantiemes du lot tels qu'imprimes ("102 / 1000"). Chaine : le denominateur varie par cle. */
  tantiemes?: string;
  /** Quote-part appelee au coproprietaire pour cette ligne (colonne "Votre quote part"). */
  montant: number;
}

/** Un appel de fonds : un coproprietaire, une periode, ses lignes, ses totaux imprimes. */
export interface AppelFonds {
  /** Identifiant d'origine (nom de fichier / index) - trace technique, pas une donnee metier. */
  source?: string;
  /** Periode appelee, en JJ/MM/AAAA ("01/01/2026"). Vide si le parseur ne l'a pas trouvee. */
  periode: string;
  /** Date d'emission du document, en JJ/MM/AAAA. */
  dateEmission?: string;
  /** Reference du compte coproprietaire telle qu'imprimee. PII : ne jamais logger. */
  reference?: string;
  /** Lots annonces en tete de document ("Lots : Cave (Lot 114) ; ..."), pour controle croise. */
  lotsAnnonces?: string[];
  lignes: LigneAppelFonds[];
  /**
   * Montant de l'APPEL tel qu'annonce en tete du document ("Votre appel de fonds provisionnel d'un
   * montant de 404,85 EUR"). C'est LE filet de controle de la somme des quote-parts.
   */
  totalImprime?: number;
  /**
   * "TOTAL A REGLER" imprime en pied. ATTENTION : ce n'est PAS le montant de l'appel - Matera y
   * ajoute les impayes anterieurs ("S'ajoutent a ce montant les impayes non regles a ce jour de
   * 404,92 EUR", mesure sur les appels d'octobre 2025 de S0303). Champ informatif : s'en servir
   * comme filet ferait echouer tout appel emis a un coproprietaire debiteur.
   */
  totalARegler?: number;
  /** Sous-totaux annonces en tete, par nature de provision ("Des provisions pour ... : X"). */
  sousTotauxImprimes?: { libelle: string; montant: number }[];
  /** Totaux imprimes par lot ("Total du lot"), par numero de lot. */
  totauxLotImprimes?: Record<string, number>;
}

/** Tolerance de rapprochement (EUR) : en dessous, un ecart n'est que du bruit d'arrondi. */
export const TOLERANCE_EUR = 0.005;

/** Arrondi comptable a 2 decimales (evite l'accumulation d'erreur flottante sur des sommes). */
export function arrondi2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Forme normalisee d'une cle pour le REGROUPEMENT : minuscule, sans accents, espaces compactes.
 * On ne retire AUCUN mot (pas de "Tantiemes" ampute) : deux cles qui different d'un mot sont deux
 * cles differentes tant qu'un mapping explicite ne dit pas le contraire.
 */
export function clefRegroupement(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Somme des quote-parts d'un appel (ce qui est reellement appele au coproprietaire). */
export function totalAppel(appel: AppelFonds): number {
  return arrondi2(appel.lignes.reduce((s, l) => s + l.montant, 0));
}

/** Somme des quote-parts de tous les appels fournis. */
export function totalGeneral(appels: AppelFonds[]): number {
  return arrondi2(appels.reduce((s, a) => s + totalAppel(a), 0));
}

/** Un agregat de quote-parts sur un regroupement (cle, nature, periode...). */
export interface TotalAgrege {
  /** Libelle du groupe, tel qu'imprime la premiere fois qu'il a ete rencontre. */
  libelle: string;
  /** Somme des quote-parts du groupe. */
  montant: number;
  /** Nombre de lignes agregees (compteur de controle : 24 lots -> 24 lignes par cle). */
  nbLignes: number;
}

/** Regroupe les lignes de tous les appels selon une projection, en sommant les quote-parts. */
function regrouper(
  appels: AppelFonds[],
  projection: (ligne: LigneAppelFonds, appel: AppelFonds) => string | undefined,
): TotalAgrege[] {
  const groupes = new Map<string, TotalAgrege>();
  for (const appel of appels) {
    for (const ligne of appel.lignes) {
      const brut = projection(ligne, appel);
      if (brut === undefined) continue;
      const clef = clefRegroupement(brut);
      const prec = groupes.get(clef) ?? { libelle: brut, montant: 0, nbLignes: 0 };
      prec.montant += ligne.montant;
      prec.nbLignes++;
      groupes.set(clef, prec);
    }
  }
  return [...groupes.values()]
    .map((g) => ({ ...g, montant: arrondi2(g.montant) }))
    .sort((a, b) => b.montant - a.montant);
}

/**
 * Totaux par CLE de repartition. Les lignes sans cle sont EXCLUES de ce total (elles ne sont
 * rattachables a rien) : c'est `lignesSansCle` qui les compte, pour qu'un manque se voie.
 */
export function totauxParCle(appels: AppelFonds[]): TotalAgrege[] {
  return regrouper(appels, (l) => l.cle);
}

/** Totaux par NATURE de provision (charges courantes / fonds travaux / ...). */
export function totauxParNature(appels: AppelFonds[]): TotalAgrege[] {
  return regrouper(appels, (l) => l.nature || undefined);
}

/**
 * Totaux par couple NATURE + CLE. Indispensable : la meme cle "Charges generales" porte a la fois
 * les provisions de charges courantes et celles de fonds travaux, qui n'atterrissent PAS sur le
 * meme compte de produit - les additionner ferait un total juste et un import faux.
 */
export function totauxParNatureEtCle(appels: AppelFonds[]): TotalAgrege[] {
  return regrouper(appels, (l) => (l.cle ? `${l.nature} | ${l.cle}` : undefined));
}

/** Totaux par PERIODE appelee (un trimestre = une periode). */
export function totauxParPeriode(appels: AppelFonds[]): TotalAgrege[] {
  return regrouper(appels, (_l, a) => a.periode || "(periode inconnue)");
}

/** Nombre de lignes sans cle determinable : doit rester a zero sur un lot de documents sain. */
export function lignesSansCle(appels: AppelFonds[]): number {
  return appels.reduce((s, a) => s + a.lignes.filter((l) => !l.cle).length, 0);
}

/** Ecart constate sur un lot entre les quote-parts parsees et le "Total du lot" imprime. */
export interface EcartLot {
  lot: string;
  total: number;
  imprime: number;
  ecart: number;
}

/** Controle d'un appel : identification NON nominative (lots) + rapprochement du total imprime. */
export interface ControleAppel {
  periode: string;
  /** Lots concernes, tries : identifie l'appel sans nommer le coproprietaire. */
  lots: string[];
  nbLignes: number;
  /** Somme des quote-parts parsees. */
  total: number;
  /** Montant de l'appel annonce en tete de document, s'il a ete lu. */
  totalImprime?: number;
  /** total - totalImprime. Non defini si le total imprime n'a pas ete lu. */
  ecart?: number;
  /**
   * Lots dont la somme des quote-parts ne retombe pas sur leur "Total du lot" imprime. Filet PLUS
   * FIN que le total du document : une ligne perdue et une ligne comptee deux fois dans deux lots
   * differents se compenseraient au total general, jamais lot par lot.
   */
  ecartsLot: EcartLot[];
}

/** Ordre des lots : numerique quand les deux numeros le sont, alphabetique sinon ("12A"). */
function comparerLots(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** Lots distincts d'un appel, tries (ordre numerique quand les numeros sont numeriques). */
export function lotsAppel(appel: AppelFonds): string[] {
  const lots = new Set(appel.lignes.map((l) => l.lot).filter((l) => l !== ""));
  return [...lots].sort(comparerLots);
}

/** Controle d'un appel : somme des quote-parts vs total imprime, au document et lot par lot. */
export function controlerAppel(appel: AppelFonds, tolerance = TOLERANCE_EUR): ControleAppel {
  const total = totalAppel(appel);
  const ecartsLot: EcartLot[] = [];
  for (const [lot, imprime] of Object.entries(appel.totauxLotImprimes ?? {})) {
    const totalLot = arrondi2(
      appel.lignes.filter((l) => l.lot === lot).reduce((s, l) => s + l.montant, 0),
    );
    const ecart = arrondi2(totalLot - imprime);
    if (Math.abs(ecart) > tolerance) ecartsLot.push({ lot, total: totalLot, imprime, ecart });
  }
  // Tri explicite : l'ordre d'enumeration d'un objet JS place les clefs entieres avant les autres,
  // ce qui rendrait le rapport dependant du format des numeros de lot.
  ecartsLot.sort((a, b) => comparerLots(a.lot, b.lot));

  const controle: ControleAppel = {
    periode: appel.periode,
    lots: lotsAppel(appel),
    nbLignes: appel.lignes.length,
    total,
    ecartsLot,
  };
  if (appel.totalImprime !== undefined) {
    controle.totalImprime = appel.totalImprime;
    controle.ecart = arrondi2(total - appel.totalImprime);
  }
  return controle;
}

/**
 * Controles de tous les appels dont la somme des quote-parts NE retombe PAS sur ce que le document
 * annonce - au total ou sur un lot. Un lot de documents sain renvoie un tableau vide ; toute
 * entree signale une ligne perdue (page de tableau non reconnue) ou comptee deux fois.
 */
export function appelsEnEcart(appels: AppelFonds[], tolerance = TOLERANCE_EUR): ControleAppel[] {
  return appels
    .map((a) => controlerAppel(a, tolerance))
    .filter((c) => (c.ecart !== undefined && Math.abs(c.ecart) > tolerance) || c.ecartsLot.length > 0);
}

/**
 * Ecart entre les sous-totaux annonces en tete (par nature de provision) et le montant de l'appel.
 * Controle INTERNE au document : il ne depend d'aucun rapprochement de libelle, seulement de deux
 * chiffres que le syndic imprime a deux endroits. Non defini si l'un des deux manque.
 */
export function ecartSousTotaux(appel: AppelFonds): number | undefined {
  if (appel.totalImprime === undefined || !appel.sousTotauxImprimes?.length) return undefined;
  const somme = appel.sousTotauxImprimes.reduce((s, t) => s + t.montant, 0);
  return arrondi2(somme - appel.totalImprime);
}

/**
 * Appels dont les lots du tableau ne couvrent pas les lots ANNONCES en tete de document.
 * Detecte un tableau tronque (lot absent du detail) que le total imprime ne revelerait pas si le
 * pied de page manquait lui aussi.
 */
export function appelsLotsIncomplets(appels: AppelFonds[]): ControleAppel[] {
  return appels
    .filter((a) => {
      if (!a.lotsAnnonces || a.lotsAnnonces.length === 0) return false;
      const vus = new Set(lotsAppel(a));
      return a.lotsAnnonces.some((lot) => !vus.has(lot));
    })
    .map(controlerAppel);
}
