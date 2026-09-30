// Le contrat de syndic comme ARBRE DE RENDU pur : titre, paragraphes, tableaux. C'est la
// seule lecture du gabarit ; l'ecran (composant React) et le PDF (HTML A4 -> Chromium) en
// font deux dessins du meme arbre, sans redecider ce qui est un titre ou une cellule de
// montant. Retour du test du 17/09/2026 : les grilles tarifaires doivent etre de vrais
// tableaux, aux colonnes alignees, qui ne se coupent pas entre deux pages.
//
// Depuis le 18/09/2026 le gabarit porte les FUSIONS du classeur : chaque cellule a sa
// largeur en cases (sur 8) et sa hauteur en lignes. Le tableau se dessine sur huit
// colonnes egales, une cellule couvre `etendue` colonnes et `portee` lignes. Plus rien
// n'est devine a partir des textes, sauf ce que le classeur ne sait pas dire : un titre
// (capitales ou numero) et une ligne d'en-tete (capitales).

import { estAslOuAful } from "@/lib/domain/copropriete";
import type { ChampsContrat } from "./champs-contrat";
import { CASES_PAR_COLONNE, GABARIT_DROITE, GABARIT_GAUCHE, GABARIT_PLEINE_LARGEUR, LIGNES_DROITE, LIGNES_GAUCHE, type BlocGabarit } from "./gabarit-contrat";
import { CASES_MANDAT, GABARIT_MANDAT, TITRE_MANDAT } from "./gabarit-mandat";
import { remplirTexte, tableRemplacement } from "./remplir-gabarit";

/** La position d'un bloc dans le classeur : premiere et derniere ligne Excel. Sert a
 *  imprimer les deux colonnes EN VIS-A-VIS, comme le classeur (cf. grilleAlignee). */
export interface PositionClasseur {
  de?: number;
  a?: number;
}

export type NoeudContrat = (
  | { type: "titre"; texte: string }
  | { type: "paragraphe"; texte: string }
  /** Un tableau sur `colonnes` colonnes egales (les cases du classeur). */
  | { type: "tableau"; colonnes: number; lignes: LigneTableau[] }
  /** Le bloc de signatures, les parties cote a cote avec la place pour signer. */
  | { type: "signatures"; parties: string[] }
) &
  PositionClasseur;

/** La ligne ou les deux parties signent, cote a cote : « Le syndicat | Le syndic » (contrat de
 *  syndic), « Le représentant de l'AFUL | Le gestionnaire de l'AFUL » (contrat de mandat). */
const SIGNATAIRE_RE = /^Le (syndicat|syndic|représentant|gestionnaire)\b/;

export interface LigneTableau {
  /** Toutes les cellules pleines en capitales : une ligne d'en-tete. */
  enTete: boolean;
  cellules: CelluleTableau[];
}

export interface CelluleTableau {
  texte: string;
  montant: boolean;
  /** Le nombre de colonnes couvertes (colspan). */
  etendue: number;
  /** Le nombre de lignes couvertes (rowspan), quand il y en a plus d'une. */
  portee?: number;
}

export interface ArbreContrat {
  /** Le titre du contrat (« CONTRAT DE SYNDIC "TOUT SAUF" N° »). */
  titre: string;
  /** Les mentions sous le titre (decrets). */
  enTete: string[];
  gauche: NoeudContrat[];
  /** Vide pour le contrat de mandat : une seule colonne. */
  droite: NoeudContrat[];
}

/** Un titre de section : ligne courte, en capitales ou numerotee (« 2. DUREE DU CONTRAT »).
 *  Le classeur ne porte aucun style exploitable, on deduit de la forme du texte. */
export function estTitre(texte: string): boolean {
  // Numerote : un titre meme long (« 7.1.3. Prestations optionnelles qui peuvent... »), meme
  // sur deux lignes (« 7.2.2. ... \n(au-dela du contenu du forfait...) »). Au-dela de 140
  // caracteres c'est un paragraphe qui commence par un numero (« 8.4 Préparation... »).
  // Numero suivi d'une lettre : « 5597.50 € HT, soit 6717 € TTC » n'est pas un titre.
  // Il faut un point dans le numero (« 1. », « 4.2.1. », « 8.4 ») : « 13 rond-point du
  // Souvenir Français » ou « 78600 Maisons-Laffitte » sont des adresses, pas des titres.
  if (/^(\d+(\.\d+)+\.?|\d+\.)\s+\p{L}/u.test(texte)) return texte.length <= 140;
  // « ANNEXE 1 AU CONTRAT DE SYNDIC \n LISTE NON LIMITATIVE… » : un titre en capitales sur deux lignes.
  if (texte.includes("\n")) return texte.startsWith("ANNEXE ") ? texte.length <= 260 : texte.length <= 200 && texte.split("\n").every((l) => estCapitales(l));
  return texte.length <= 90 && estCapitales(texte);
}

function estCapitales(texte: string): boolean {
  const lettres = texte.replace(/[^A-Za-zÀ-ÿ]/g, "");
  return lettres.length > 3 && lettres === lettres.toUpperCase();
}

/** Une cellule d'en-tete : sa premiere ligne est en capitales (« MODALITE DE TARIFICATION\nconvenues »). */
function estCelluleEnTete(texte: string): boolean {
  return estCapitales(texte.split("\n")[0] ?? "");
}

/** Une cellule de montant : « 163.65 », « 163,65 € », « 1 234.00 ». */
export function estMontant(texte: string): boolean {
  return /^[\d\s .,]+(€|EUR)?$/.test(texte.trim()) && /\d/.test(texte);
}

function colonne(
  blocs: readonly BlocGabarit[],
  table: Record<string, string>,
  options: { fraisPostauxReels?: boolean; sansCorrections?: boolean },
  cases = CASES_PAR_COLONNE,
  positions?: readonly (readonly [number, number])[],
): NoeudContrat[] {
  const noeuds: NoeudContrat[] = [];
  let serie: LigneTableau[] = [];
  let serieDe: number | undefined;
  let serieA: number | undefined;
  const pos = (i: number): PositionClasseur => (positions?.[i] ? { de: positions[i]![0], a: positions[i]![1] } : {});
  const vider = () => {
    // Un en-tete sans aucune ligne : le classeur repetait « PRESTATIONS | DÉTAILS » en haut de
    // chaque page ; ici le <thead> se repete tout seul, l'en-tete orphelin ne sert a rien.
    if (serie.some((l) => !l.enTete)) noeuds.push({ type: "tableau", colonnes: cases, lignes: serie, ...(serieDe !== undefined ? { de: serieDe, a: serieA } : {}) });
    serie = [];
    serieDe = undefined;
    serieA = undefined;
  };
  blocs.forEach((bloc, i) => {
    if (typeof bloc === "string") {
      vider();
      const texte = remplirTexte(bloc, table, options);
      noeuds.push(estTitre(texte) ? { type: "titre", texte, ...pos(i) } : { type: "paragraphe", texte, ...pos(i) });
      return;
    }
    // La ligne ou les deux parties signent, cote a cote : un bloc de signatures, pas un tableau.
    if (bloc.length === 2 && bloc.every((c) => SIGNATAIRE_RE.test(c.texte))) {
      vider();
      noeuds.push({ type: "signatures", parties: bloc.map((c) => remplirTexte(c.texte, table, options)), ...pos(i) });
      return;
    }
    const cellules: CelluleTableau[] = bloc.map((c) => {
      const texte = remplirTexte(c.texte, table, options);
      return { texte, montant: estMontant(texte), etendue: c.largeur, ...(c.hauteur && c.hauteur > 1 ? { portee: c.hauteur } : {}) };
    });
    const pleines = cellules.filter((c) => c.texte);
    const enTete = pleines.length > 0 && pleines.every((c) => estCelluleEnTete(c.texte));
    // Un en-tete au milieu d'une grille : le classeur le repetait en haut de chaque page. Le
    // <thead> se repete tout seul, on ne garde que le premier.
    if (enTete && serie.length > 0) return;
    const p = pos(i);
    if (serie.length === 0) serieDe = p.de;
    serieA = p.a ?? serieA;
    serie.push({ enTete, cellules });
  });
  vider();
  return noeuds;
}

/** Un bloc place sur la grille en vis-a-vis : sa rangee (1 = la premiere) et le nombre de rangees qu'il couvre. */
export interface BlocPlace {
  noeud: NoeudContrat;
  rangee: number;
  etendue: number;
}

/**
 * Les deux colonnes EN VIS-A-VIS, comme le classeur les imprime : un bloc qui commence a la
 * ligne Excel 47 a gauche est en face de celui qui commence a la ligne 47 a droite, et une
 * cellule fusionnee sur dix lignes couvre les rangees des blocs d'en face. Retour du patron
 * (21/09/2026) : deux colonnes independantes mettaient le § 4 une page trop tot et le
 * 7.2.3 avant le 7.2.2.
 */
export function grilleAlignee(a: ArbreContrat): { rangees: number; gauche: BlocPlace[]; droite: BlocPlace[] } {
  const tous = [...a.gauche, ...a.droite];
  const debuts = [...new Set(tous.map((n) => n.de).filter((x): x is number => x !== undefined))].sort((x, y) => x - y);
  const rangeeDe = new Map(debuts.map((d, i) => [d, i + 1]));
  const placer = (noeuds: NoeudContrat[]): BlocPlace[] => {
    let suivante = 1;
    return noeuds.map((noeud) => {
      const rangee = noeud.de !== undefined ? (rangeeDe.get(noeud.de) ?? suivante) : suivante;
      const fin = noeud.a ?? noeud.de ?? rangee;
      const etendue = noeud.de !== undefined ? Math.max(1, debuts.filter((d) => d >= noeud.de! && d <= fin).length) : 1;
      suivante = rangee + etendue;
      return { noeud, rangee, etendue };
    });
  };
  const gauche = placer(a.gauche);
  const droite = placer(a.droite);
  const rangees = Math.max(debuts.length, ...gauche.map((p) => p.rangee + p.etendue - 1), ...droite.map((p) => p.rangee + p.etendue - 1));
  return { rangees, gauche, droite };
}

/** Une rangee du vis-a-vis : ce que la colonne de gauche et celle de droite portent en face. */
export interface RangeeVisAVis {
  gauche: NoeudContrat[];
  droite: NoeudContrat[];
}

/**
 * Le vis-a-vis REGROUPE : on coupe la grille a chaque hauteur ou aucun bloc, ni a gauche ni a
 * droite, n'est a cheval. Chaque groupe devient une rangee de tableau HTML, ou les deux
 * colonnes restent en face sans qu'aucune cellule n'ait besoin de rowspan.
 *
 * Pourquoi un tableau et plus une grille CSS (29/09/2026) : Chromium ne sait pas couper une
 * grille entre deux pages. Une bande de rangees a cheval sur une fin de page gardait la
 * hauteur calculee pour la page entiere, et son contenu s'imprimait PAR-DESSUS celui de la
 * bande suivante (annexe 1 et fiche d'information superposees, page 9). Un tableau, lui, se
 * fragmente correctement depuis toujours.
 */
export function rangeesVisAVis(a: ArbreContrat): RangeeVisAVis[] {
  const g = grilleAlignee(a);
  // Les hauteurs ou l'on peut couper : aucune des deux colonnes n'y a de bloc a cheval.
  const aCheval = (r: number) => [...g.gauche, ...g.droite].some((p) => p.rangee < r && p.rangee + p.etendue > r);
  const coupures: number[] = [];
  for (let r = 2; r <= g.rangees + 1; r++) if (!aCheval(r)) coupures.push(r);
  const rangees: RangeeVisAVis[] = [];
  let debut = 1;
  for (const fin of coupures) {
    const dans = (blocs: typeof g.gauche) => blocs.filter((p) => p.rangee >= debut && p.rangee < fin).map((p) => p.noeud);
    const rangee = { gauche: dans(g.gauche), droite: dans(g.droite) };
    if (rangee.gauche.length || rangee.droite.length) rangees.push(rangee);
    debut = fin;
  }
  return rangees;
}

/**
 * Les phrases que le CLASSEUR coupe entre la colonne de gauche et celle de droite.
 *
 * Le classeur MYTHEC est une mise en page, pas un texte : quand un paragraphe ne tenait plus
 * au bas de la colonne de gauche, la fin a ete recopiee a la main en haut de la colonne de
 * droite. Les deux morceaux ne portent donc AUCUN lien, et les colonnes ne sont
 * qu'approximativement synchronisees d'une ligne a l'autre. Resultat mesure sur la S111
 * (30/09/2026) : « ...dans les conditions precisees a » finissait page 3, et sa suite
 * « l'article 18 de la loi... » etait imprimee page 2 — la fin AVANT le debut. Le president
 * d'un conseil syndical a refuse de signer, faute de pouvoir lire l'article en entier.
 *
 * On recolle donc chaque phrase avant de dessiner : le premier paragraphe du bloc de droite
 * rejoint le bloc de gauche, le reste du bloc de droite ne bouge pas.
 *
 * Les reperes sont des TEXTES, pas des indices : si le cabinet met a jour son classeur et
 * que la coupure se deplace, le test echoue au lieu de recoller au mauvais endroit.
 */
const RECOLLEMENTS: readonly { readonly finGauche: string; readonly debutDroite: string }[] = [
  {
    finGauche: "le conseil syndical peut prendre connaissance et copie, a sa demande,",
    debutDroite: "apres en avoir donne avis au syndic,",
  },
  {
    finGauche: "et dans les conditions precisees a",
    debutDroite: "l'article 18 de la loi du 10 juillet 1965, decide de confier les archives",
  },
];

/** Apostrophes et accents neutralises : le classeur melange ' et ’ d'un bloc a l'autre. */
function repere(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Le premier paragraphe d'un bloc, et ce qui reste derriere. */
function detacherPremierParagraphe(texte: string): { premier: string; reste: string } {
  const coupure = texte.search(/\n[ \t]*\n/);
  if (coupure === -1) return { premier: texte.trim(), reste: "" };
  return { premier: texte.slice(0, coupure).trim(), reste: texte.slice(coupure).replace(/^\s+/, "") };
}

/**
 * Recolle les phrases coupees entre les deux colonnes. Rend les deux colonnes corrigees et
 * la liste des recollements NON appliques : un recollement qui ne trouve plus ses deux
 * reperes est une alerte, pas un detail — le gabarit a bouge sous nos pieds.
 */
export function recollerPhrasesCoupees(
  gauche: NoeudContrat[],
  droite: NoeudContrat[],
): { gauche: NoeudContrat[]; droite: NoeudContrat[]; manques: string[] } {
  const g = [...gauche];
  const d = [...droite];
  const manques: string[] = [];
  for (const { finGauche, debutDroite } of RECOLLEMENTS) {
    const ig = g.findIndex((n) => n.type === "paragraphe" && repere(n.texte).endsWith(repere(finGauche)));
    const id = d.findIndex((n) => n.type === "paragraphe" && repere(n.texte).startsWith(repere(debutDroite)));
    if (ig === -1 || id === -1) {
      manques.push(finGauche);
      continue;
    }
    const cible = g[ig] as Extract<NoeudContrat, { type: "paragraphe" }>;
    const source = d[id] as Extract<NoeudContrat, { type: "paragraphe" }>;
    const { premier, reste } = detacherPremierParagraphe(source.texte);
    g[ig] = { ...cible, texte: `${cible.texte.trimEnd()} ${premier}` };
    // Le bloc de droite vide disparait ; sinon il garde sa place et sa position classeur.
    if (reste) d[id] = { ...source, texte: reste };
    else d.splice(id, 1);
  }
  return { gauche: g, droite: d, manques };
}

export function arbreContrat(champs: ChampsContrat): ArbreContrat {
  const table = tableRemplacement(champs);
  // ASL / AFUL : le contrat de mandat du gestionnaire, une colonne, sans les corrections
  // propres au contrat de syndic.
  if (estAslOuAful(champs.copro.formeJuridique)) {
    const options = { sansCorrections: true };
    return { titre: remplirTexte(TITRE_MANDAT, table, options), enTete: [], gauche: colonne(GABARIT_MANDAT, table, options, CASES_MANDAT), droite: [] };
  }
  const options = { fraisPostauxReels: champs.fraisPostauxReels };
  const [titre, ...enTete] = GABARIT_PLEINE_LARGEUR.map((b) => remplirTexte(b, table, options));
  const droite = colonne(GABARIT_DROITE, table, options, CASES_PAR_COLONNE, LIGNES_DROITE);
  if (champs.conditionsParticulieres) {
    droite.push({ type: "titre", texte: "CONDITIONS PARTICULIÈRES" }, { type: "paragraphe", texte: champs.conditionsParticulieres });
  }
  const recolle = recollerPhrasesCoupees(colonne(GABARIT_GAUCHE, table, options, CASES_PAR_COLONNE, LIGNES_GAUCHE), droite);
  return { titre: titre ?? "", enTete, gauche: recolle.gauche, droite: recolle.droite };
}
