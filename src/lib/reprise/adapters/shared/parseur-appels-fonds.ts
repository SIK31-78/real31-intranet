// PARSEUR DETERMINISTE des APPELS DE FONDS a partir de la COUCHE TEXTE POSITIONNEE (PDF natif).
// PUR, zero reseau, entierement testable avec des items synthetiques. Meme doctrine que le
// parseur du grand livre : les colonnes sont des COORDONNEES, reconnues par les EN-TETES IMPRIMES
// ("Lot", "Nature de l'appel", "Montant a repartir", "Vos tantiemes", "Votre quote part"), jamais
// par une position codee en dur - un changement de gabarit du syndic deplace les en-tetes et les
// ancres suivent.
//
// LA PARTICULARITE DU DOCUMENT (mesuree sur les 40 appels Matera S0303, 4 trimestres) : une ligne
// de detail est DESSINEE SUR TROIS LIGNES VISUELLES empilees, pas une seule :
//     y=380.6   114                Provision pour charges courantes
//     y=375.4                                          1 975,09 €   3 / 1000   5,94 €
//     y=370.3   Cave               (Charges generales)
// Les trois sous-lignes sont espacees de ~5 unites alors que deux blocs le sont de ~19. On NE
// fusionne PAS geometriquement (un seuil en unites PDF serait un chiffre magique de plus) : on
// ANCRE sur la sous-ligne du MILIEU - la seule a porter le couple tantiemes + quote-part - et on
// lit le libelle sur les lignes IMMEDIATEMENT ADJACENTES dans l'ordre de lecture. L'adjacence est
// un rang, pas une distance : elle survit a un changement d'interligne ou de taille de police.
//
// CE QU'ON NE FAIT PAS : traduire "(Charges generales)" en numero de cle eStale. Le parseur rend
// la cle TELLE QU'IMPRIMEE ; le rattachement est de la semantique d'import, ailleurs.
//
// ECHEC VISIBLE : tout ce qui n'est pas reconnu produit une NOTE (page + motif). Un document dont
// le tableau n'est pas reconnu ne rend pas un appel vide en silence - il rend un appel sans lignes
// ET une note qui le dit.

import { parseNombreFr } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import type { ItemTexte, PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import {
  dedoublonnerItems,
  extraireDate,
  plier,
  tokensFold,
} from "@/lib/reprise/adapters/shared/texte-positions";
import type { AppelFonds, LigneAppelFonds } from "@/lib/reprise/domain/appel-fonds";

/** Une note de diagnostic : ce que le parseur n'a pas su lire, et ou. */
export interface NoteParsageAppels {
  /** Numero de page (1-based) quand la note est localisable. */
  page?: number;
  /** Motif, sans PII : jamais un nom, jamais un libelle nominatif. */
  motif: string;
}

/** Resultat du parsage : les appels reconstruits + les diagnostics. */
export interface ResultatAppelsFonds {
  appels: AppelFonds[];
  notes: NoteParsageAppels[];
}

/** Ancre horizontale d'une colonne, mesuree sur son EN-TETE imprime. */
interface Ancre {
  gauche: number;
  droit: number;
  centre: number;
}

/** Colonnes d'un tableau d'appel, detectees sur une page a partir de ses en-tetes. */
export interface ColonnesAppel {
  /** Colonne "Lot" (numero de lot, puis nature du lot sur la sous-ligne du bas). */
  lot?: Ancre;
  /** Colonne "Nature de l'appel" (libelle de provision, puis cle entre parentheses). */
  nature?: Ancre;
  /** Colonne "Montant a repartir" (le budget de la cle pour la periode). */
  aRepartir?: Ancre;
  /** Colonne "Vos tantiemes" (fraction imprimee, ex. "102 / 1000"). */
  tantiemes: Ancre;
  /** Colonne "Votre quote part" (le montant reellement appele). */
  quotePart: Ancre;
  /** Frontiere : un item commencant a gauche de cette abscisse est du TEXTE, pas un montant. */
  texteMaxX: number;
  /** Frontiere interne a la zone texte : a gauche = colonne Lot, a droite = colonne Nature. */
  natureMinX: number;
}

/**
 * Tantiemes tels qu'imprimes : "102 / 1000". Volontairement NON converti en nombre - le
 * denominateur change d'une cle a l'autre et la fraction est un libelle de controle, pas un
 * montant. `parseNombreFr` rend deja `null` dessus (le "/" casse la reconnaissance), ce qui
 * garantit qu'une fraction ne peut pas etre comptee comme une quote-part.
 */
const RE_TANTIEMES = /^\s*\d[\d\s]*\/\s*\d[\d\s]*$/;

/** Titre du document, tel qu'imprime seul sur sa ligne. Ouvre un nouvel appel. */
const TITRE_APPEL = "appel de fonds";

/** Date d'emission imprimee seule ("Le 08/01/2026"). */
const RE_DATE_EMISSION = /^le\s+\d{1,2}\/\d{1,2}\/\d{4}$/;

/** Reference du compte coproprietaire, imprimee comme libelle de virement ("Paiement - X"). */
const RE_REFERENCE = /paiement\s*[-–]\s*(.+)$/i;

/** Lots annonces en tete ("Lots : Cave (Lot 114) ; Appartement (Lot 101)"). */
const RE_LOT_ANNONCE = /lot\s+([\w-]+)/gi;

/**
 * Chapo annoncant le MONTANT DE L'APPEL : "Votre appel de fonds provisionnel d'un montant de
 * 404,85 €...". C'est LUI le filet de controle, pas le "TOTAL A REGLER" du pied de page - ce
 * dernier ajoute les impayes anterieurs (mesure sur les appels d'octobre 2025 de S0303 : total a
 * regler 809,77 = appel 404,85 + arriere 404,92). Le point souple absorbe l'apostrophe
 * typographique, que le pliage ne normalise pas.
 */
const RE_CHAPO_MONTANT = /appel de fonds provisionnel d.?un montant de/;

/** Sous-total annonce en tete, par nature ("Des provisions pour charges courantes : 386,30 €"). */
const RE_SOUS_TOTAL = /^des provisions pour (.+?)\s*:/;

function ancreDe(it: ItemTexte): Ancre {
  return { gauche: it.x, droit: it.x + it.largeur, centre: it.x + it.largeur / 2 };
}

/** Items d'une ligne, faux gras retire (meme chaine dessinee deux fois au meme endroit). */
function itemsNets(items: ItemTexte[]): ItemTexte[] {
  return dedoublonnerItems(items).items;
}

function joindre(items: ItemTexte[]): string {
  return items
    .map((it) => it.chaine)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detecte les colonnes du tableau de detail sur une page, a partir de ses EN-TETES imprimes.
 * On retient la PREMIERE ligne (ordre de lecture) portant a la fois un en-tete de tantiemes et un
 * en-tete de quote-part : ce sont les deux colonnes sans lesquelles on ne sait pas lire une ligne.
 *
 * Piege ecarte : le libelle de cle "(Tantiemes CHARGES BATIMENT - A)" porte lui aussi le token
 * "tantiemes". Il est exclu par deux garde-fous - il est entre PARENTHESES, et sa ligne ne porte
 * jamais d'en-tete de quote-part. Sans ca, une ligne de detail serait prise pour l'en-tete et
 * toutes les ancres partiraient dans la colonne des libelles.
 *
 * Renvoie null si la page ne porte pas de tableau de detail (page d'annexes, courrier
 * d'accompagnement) : l'appelant l'ignore sans bruit, le manque se verra sur le total imprime.
 */
export function detecterColonnesAppel(page: PageTexte): ColonnesAppel | null {
  for (const ligne of page.lignes) {
    let lot: Ancre | undefined;
    let nature: Ancre | undefined;
    let aRepartir: Ancre | undefined;
    let tantiemes: Ancre | undefined;
    let quotePart: Ancre | undefined;

    for (const it of itemsNets(ligne.items)) {
      // Tokens EXACTS (jamais de sous-chaine) : "Total du lot" ne doit pas voler l'ancre "Lot".
      const tokens = tokensFold(it.chaine);
      const set = new Set(tokens);
      const entreParentheses = it.chaine.trim().startsWith("(");
      if (entreParentheses) continue; // libelle de cle, jamais un en-tete
      if (tokens.length === 1 && tokens[0] === "lot") lot = ancreDe(it);
      else if (set.has("nature") && set.has("appel")) nature = ancreDe(it);
      else if (set.has("montant") && set.has("repartir")) aRepartir = ancreDe(it);
      else if (set.has("tantiemes")) tantiemes = ancreDe(it);
      else if (set.has("quote") && set.has("part")) quotePart = ancreDe(it);
    }

    if (!tantiemes || !quotePart) continue;

    // Frontiere texte / montants : le bord GAUCHE de la premiere colonne numerique. Aucune marge
    // arbitraire - les libelles s'arretent bien avant, et un montant plus large que son en-tete
    // deborde vers la gauche de quelques unites seulement (mesure : 33 unites de marge reelle).
    const texteMaxX = Math.min(aRepartir?.gauche ?? Number.POSITIVE_INFINITY, tantiemes.gauche, quotePart.gauche);
    // Sans en-tete "Lot" ni "Nature", tout le texte tombe en colonne Nature (le numero de lot
    // sera vide et signale) : mieux vaut un champ manquant qu'un decoupage invente.
    const natureMinX = nature?.gauche ?? Number.NEGATIVE_INFINITY;
    return { lot, nature, aRepartir, tantiemes, quotePart, texteMaxX, natureMinX };
  }
  return null;
}

/** Distance d'un item a une ancre : la plus petite entre alignement a DROITE et centrage. */
function distanceAncre(it: ItemTexte, a: Ancre): number {
  const droit = it.x + it.largeur;
  const centre = it.x + it.largeur / 2;
  return Math.min(Math.abs(droit - a.droit), Math.abs(centre - a.centre));
}

/** Ce qu'une sous-ligne du MILIEU porte : les valeurs numeriques du tableau. */
interface ValeursLigne {
  aRepartir?: number;
  tantiemes?: string;
  quotePart?: number;
  /** Nombres tombes dans la colonne des tantiemes : anomalie de gabarit, signalee. */
  nbEgares: number;
}

/**
 * Lit la zone MONTANTS d'une ligne : chaque item numerique est rattache a l'ancre la plus proche.
 * Les colonnes etant alignees a droite chez Matera (bords droits a moins d'1,5 unite de leur
 * en-tete) et centrees ailleurs, on prend la plus petite des deux distances - le parseur tient
 * donc les deux conventions d'alignement sans le savoir a l'avance.
 */
function lireValeurs(items: ItemTexte[], col: ColonnesAppel): ValeursLigne {
  const res: ValeursLigne = { nbEgares: 0 };
  const ancres: { a: Ancre; role: "repartir" | "tantiemes" | "quote" }[] = [
    { a: col.tantiemes, role: "tantiemes" },
    { a: col.quotePart, role: "quote" },
  ];
  if (col.aRepartir) ancres.push({ a: col.aRepartir, role: "repartir" });

  for (const it of items) {
    if (it.x < col.texteMaxX) continue; // zone texte
    if (RE_TANTIEMES.test(it.chaine)) {
      res.tantiemes = it.chaine.replace(/\s+/g, " ").trim();
      continue;
    }
    const n = parseNombreFr(it.chaine);
    if (n === null) continue;
    let role = ancres[0]!.role;
    let dist = distanceAncre(it, ancres[0]!.a);
    for (const cand of ancres) {
      const d = distanceAncre(it, cand.a);
      if (d < dist) {
        dist = d;
        role = cand.role;
      }
    }
    if (role === "quote") res.quotePart = n;
    else if (role === "repartir") res.aRepartir = n;
    else res.nbEgares++; // un nombre dans la colonne des fractions : gabarit inattendu
  }
  return res;
}

/**
 * Premier montant lisible d'une ligne, TOUTES colonnes confondues. Sert aux montants noyes dans
 * une phrase du chapo, hors du tableau et donc hors de toute colonne. Les libelles qui contiennent
 * une annee ("... au 31 decembre 2025. Il comprend :") ne rendent rien : `parseNombreFr` refuse
 * une chaine qui n'est pas UNIQUEMENT un nombre.
 */
function premierMontant(items: ItemTexte[]): number | undefined {
  for (const it of items) {
    const n = parseNombreFr(it.chaine);
    if (n !== null) return n;
  }
  return undefined;
}

/** Zone texte d'une ligne, decoupee en colonne Lot et colonne Nature. */
interface TexteLigne {
  lot: string;
  nature: string;
}

function lireTexte(items: ItemTexte[], col: ColonnesAppel): TexteLigne {
  const gauche = items.filter((it) => it.x < col.texteMaxX);
  return {
    lot: joindre(gauche.filter((it) => it.x < col.natureMinX)),
    nature: joindre(gauche.filter((it) => it.x >= col.natureMinX)),
  };
}

/** Une ligne visuelle deja preparee (faux gras retire, texte plie disponible). */
interface LignePreparee {
  items: ItemTexte[];
  texte: string;
  fold: string;
}

function preparer(page: PageTexte): LignePreparee[] {
  return page.lignes.map((l) => {
    const items = itemsNets(l.items);
    const texte = joindre(items);
    return { items, texte, fold: plier(texte) };
  });
}

/** Metadonnees d'entete rencontrees AVANT le titre : mises de cote puis posees sur l'appel. */
interface MetaEnAttente {
  dateEmission?: string;
  reference?: string;
  lotsAnnonces?: string[];
}

/**
 * Extrait la cle de repartition d'un libelle : le contenu des DERNIERES parentheses.
 * "Provision pour charges courantes (Charges generales)" -> "Charges generales".
 * Renvoie undefined si le libelle n'en porte pas : la ligne existe mais n'est rattachable a
 * aucune grille de tantiemes, et le domaine la comptera comme telle.
 */
export function extraireCle(libelle: string): string | undefined {
  const m = libelle.match(/\(([^()]*)\)\s*$/);
  const cle = m?.[1]?.trim();
  return cle ? cle : undefined;
}

/**
 * Parse un flux de pages en APPELS DE FONDS. Un nouvel appel s'ouvre a chaque page portant le
 * titre imprime seul sur sa ligne : le meme code lit donc un PDF par coproprietaire (le cas
 * Matera) comme un PDF groupe qui les enchaine.
 *
 * @param pages  pages issues de `extraireTextePages` (couche texte positionnee).
 * @param source identifiant technique d'origine, recopie sur chaque appel (trace, pas metier).
 */
export function parserAppelsFonds(pages: PageTexte[], source?: string): ResultatAppelsFonds {
  const appels: AppelFonds[] = [];
  const notes: NoteParsageAppels[] = [];
  let courant: AppelFonds | null = null;
  let meta: MetaEnAttente = {};
  let nbPagesAvecTableau = 0;

  for (let p = 0; p < pages.length; p++) {
    const page = pages[p]!;
    const numPage = p + 1;
    const lignes = preparer(page);
    const col = detecterColonnesAppel(page);
    if (col) nbPagesAvecTableau++;
    // Dernier lot rencontre sur la page : rattache les "Total du lot" imprimes en pied de bloc.
    let dernierLot = "";

    for (let i = 0; i < lignes.length; i++) {
      const ligne = lignes[i]!;

      // --- Titre : ouvre un appel. Egalite STRICTE : "Comment payer vos appels de fonds ?"
      // (page 2 du meme document) ne doit surtout pas en ouvrir un second.
      if (ligne.fold === TITRE_APPEL) {
        courant = {
          ...(source !== undefined ? { source } : {}),
          periode: lirePeriode(lignes, i),
          lignes: [],
          ...meta,
        };
        if (courant.periode === "") {
          notes.push({ page: numPage, motif: "periode de l'appel introuvable sous le titre" });
        }
        meta = {};
        appels.push(courant);
        continue;
      }

      // --- Metadonnees (peuvent preceder le titre : on les met de cote le cas echeant).
      if (RE_DATE_EMISSION.test(ligne.fold)) {
        const emission = extraireDate(ligne.texte);
        if (emission) poser(courant, meta, "dateEmission", emission);
        continue;
      }
      if (ligne.fold.startsWith("lots :") || ligne.fold.startsWith("lots:")) {
        const lots = [...ligne.texte.matchAll(RE_LOT_ANNONCE)].map((m) => m[1]!);
        if (lots.length > 0) poser(courant, meta, "lotsAnnonces", lots);
        continue;
      }
      const ref = ligne.texte.match(RE_REFERENCE);
      if (ref?.[1]) {
        poser(courant, meta, "reference", ref[1].trim());
        continue;
      }

      // --- Montant de l'appel annonce en tete : le filet de controle du document.
      if (RE_CHAPO_MONTANT.test(ligne.fold)) {
        const montant = premierMontant(ligne.items);
        if (montant === undefined) {
          notes.push({ page: numPage, motif: "chapo du montant de l'appel sans montant lisible" });
        } else if (courant) {
          if (courant.totalImprime === undefined) courant.totalImprime = montant;
        } else {
          notes.push({ page: numPage, motif: "montant de l'appel rencontre avant tout titre d'appel" });
        }
        continue;
      }

      // --- Sous-totaux par nature annonces sous le chapo (seconde ancre de controle).
      const sousTotal = ligne.fold.match(RE_SOUS_TOTAL);
      if (sousTotal?.[1]) {
        const montant = premierMontant(ligne.items);
        if (montant !== undefined && courant) {
          courant.sousTotauxImprimes = [
            ...(courant.sousTotauxImprimes ?? []),
            { libelle: sousTotal[1].trim(), montant },
          ];
        }
        continue;
      }

      if (!col) continue; // page sans tableau de detail : rien d'autre a y lire

      const valeurs = lireValeurs(ligne.items, col);
      if (valeurs.nbEgares > 0) {
        notes.push({
          page: numPage,
          motif: `${valeurs.nbEgares} nombre(s) tombe(s) dans la colonne des tantiemes (gabarit inattendu)`,
        });
      }

      // --- "TOTAL A REGLER" du pied de page : montant a payer, IMPAYES ANTERIEURS INCLUS. On le
      // capture pour l'information, jamais comme filet - un coproprietaire debiteur le ferait
      // diverger de l'appel du trimestre sans qu'aucune ligne ne soit fausse.
      if (ligne.fold.startsWith("total a regler") && valeurs.quotePart !== undefined) {
        if (courant) courant.totalARegler = valeurs.quotePart;
        else notes.push({ page: numPage, motif: "total a regler rencontre hors de tout appel" });
        continue;
      }

      // --- Total imprime d'un lot : capture pour controle, jamais compte comme une ligne.
      if (ligne.fold.startsWith("total du lot") && valeurs.quotePart !== undefined) {
        if (courant && dernierLot) {
          courant.totauxLotImprimes = { ...courant.totauxLotImprimes, [dernierLot]: valeurs.quotePart };
        }
        continue;
      }

      // --- Ligne de detail : la sous-ligne du MILIEU, seule a porter tantiemes ET quote-part.
      if (valeurs.tantiemes === undefined || valeurs.quotePart === undefined) continue;

      if (!courant) {
        notes.push({ page: numPage, motif: "ligne de detail rencontree avant tout titre d'appel" });
        continue;
      }

      // Libelle : sous-ligne du DESSUS (numero de lot + nature) et sous-ligne du DESSOUS (nature
      // du lot + cle). Adjacence par RANG dans l'ordre de lecture, pas par distance en unites PDF.
      // Une voisine qui porte elle-meme des valeurs appartient a un autre bloc : on l'ignore.
      const haut = voisineTexte(lignes, i - 1, col);
      const bas = voisineTexte(lignes, i + 1, col);

      // Le NUMERO de lot est imprime au-dessus, la NATURE du lot ("Cave") en dessous : on ne les
      // interchange jamais. Un lot absent reste vide et se signale - "Cave" en guise de numero de
      // lot passerait tous les controles de total tout en rendant l'appel inexploitable.
      const lot = haut?.lot ?? "";
      const natureLot = bas?.lot || undefined;
      const libelle = [haut?.nature, bas?.nature].filter((s) => s && s.length > 0).join(" ").trim();
      const cle = extraireCle(libelle);
      const nature = libelle.replace(/\s*\([^()]*\)\s*$/, "").trim();

      if (lot === "") {
        notes.push({ page: numPage, motif: "ligne de detail sans numero de lot lisible" });
      }
      if (libelle === "") {
        notes.push({ page: numPage, motif: "ligne de detail sans libelle adjacent lisible" });
      } else if (!cle) {
        notes.push({ page: numPage, motif: "ligne de detail sans cle de repartition entre parentheses" });
      }

      const detail: LigneAppelFonds = {
        lot,
        libelle,
        nature,
        montant: valeurs.quotePart,
      };
      if (natureLot) detail.natureLot = natureLot;
      if (cle) detail.cle = cle;
      if (valeurs.aRepartir !== undefined) detail.montantARepartir = valeurs.aRepartir;
      detail.tantiemes = valeurs.tantiemes;
      courant.lignes.push(detail);
      if (lot) dernierLot = lot;
    }
  }

  if (appels.length === 0) {
    notes.push({ motif: `aucun appel de fonds reconnu sur ${pages.length} page(s) : titre imprime introuvable` });
  }
  if (nbPagesAvecTableau === 0 && pages.length > 0) {
    notes.push({ motif: "aucune page ne porte les en-tetes du tableau de detail (Vos tantiemes / Votre quote part)" });
  }
  for (const a of appels) {
    if (a.lignes.length === 0) {
      notes.push({ motif: `appel de la periode ${a.periode || "(inconnue)"} sans aucune ligne de detail` });
    }
  }

  return { appels, notes };
}

/** Pose une metadonnee sur l'appel courant, ou la met de cote si le titre n'est pas encore passe. */
function poser<K extends keyof MetaEnAttente>(
  courant: AppelFonds | null,
  meta: MetaEnAttente,
  champ: K,
  valeur: NonNullable<MetaEnAttente[K]>,
): void {
  // `AppelFonds` porte les memes champs optionnels que `MetaEnAttente` : on ecrit a travers cette
  // vue commune, ce qui evite un cast et garde la meme regle des deux cotes.
  const cible: MetaEnAttente = courant ?? meta;
  // Le PREMIER vu gagne : un pied de page peut reimprimer une date sans rapport avec l'emission.
  if (cible[champ] === undefined) cible[champ] = valeur;
}

/**
 * Periode appelee : la ligne "du 01 janvier 2026" qui suit le titre. On borne la recherche aux
 * lignes juste apres le titre et on exige la forme "du ..." - sinon la date d'EMISSION imprimee
 * plus haut ("Le 08/01/2026") ou une date de libelle serait prise pour la periode.
 */
function lirePeriode(lignes: LignePreparee[], indexTitre: number): string {
  for (let i = indexTitre; i <= Math.min(indexTitre + 3, lignes.length - 1); i++) {
    const l = lignes[i]!;
    if (i !== indexTitre && !l.fold.startsWith("du ")) continue;
    const date = extraireDate(l.texte);
    if (date) return date;
  }
  return "";
}

/**
 * Lit la zone texte d'une ligne VOISINE d'une ligne de detail. Renvoie undefined si la voisine
 * porte elle-meme des valeurs (elle appartient a un autre bloc) ou n'a aucun texte exploitable.
 */
function voisineTexte(lignes: LignePreparee[], index: number, col: ColonnesAppel): TexteLigne | undefined {
  if (index < 0 || index >= lignes.length) return undefined;
  const l = lignes[index]!;
  const valeurs = lireValeurs(l.items, col);
  if (valeurs.quotePart !== undefined || valeurs.tantiemes !== undefined) return undefined;
  const texte = lireTexte(l.items, col);
  if (texte.lot === "" && texte.nature === "") return undefined;
  return texte;
}
