// Frais postaux AU REEL des copros ESTALE (REA-490).
//
// ESTALE facture chaque mois a REAL31 ses envois (detail Excel « Consommation <mois> ») :
// une ligne par destinataire et par composante. Ce module les regroupe par copro puis par
// ENVOI (un appel de fonds, un mailing, une convocation) : c'est a cette maille que la
// comptable decide de refacturer ou non (une mise en demeure, prestation particuliere, a
// ses frais d'envoi compris ; les factures du 23/10/2026 ont ecarte certains appels).
// Timbres, LRE et service restent separes : la refacturation du service n'est pas
// tranchee (question a Clementine, 03/11/2026).
//
// Montants en CENTIMES : les prix unitaires ESTALE ont deux decimales, une somme en
// flottants derive au-dela de quelques centaines de lignes.

/** Une ligne du detail de consommation ESTALE, telle que lue dans l'Excel. */
export interface LigneConsommationEstale {
  /** « Appel de fonds », « Mailing », « AG Convocation »… */
  scope: string;
  /** « Timbre LRAR », « Service Ecopli », « Envoi Recommandé Electronique », « Abo. Essentiel »… */
  categorie: string;
  /** Date de l'envoi, ISO "YYYY-MM-DD". */
  dateISO: string;
  prixUnitaireHtCentimes: number;
  prixUnitaireTtcCentimes: number;
  quantite: number;
  /** « Référence 1 » : identifiant de l'envoi (mailing, appel de fonds, AG). */
  sourceId: string;
  /** « Détail » : porte le plus souvent le code copro (« [S0302] Appel de fonds… », « S302 - … »). */
  detail: string;
}

/**
 * timbre = affranchissement (sans TVA) ; lre = lettre recommandee electronique ;
 * service = impression, mise sous pli, depot (avec TVA).
 */
export type NatureFraisPostaux = "timbre" | "lre" | "service";

function sansAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Nature d'une categorie ESTALE, ou null si ce n'est pas un frais d'envoi (abonnement…). */
export function natureFrais(categorie: string): NatureFraisPostaux | null {
  const c = sansAccents(categorie);
  if (c.startsWith("timbre")) return "timbre";
  if (c.startsWith("service")) return "service";
  if (c.includes("recommande electronique")) return "lre";
  return null;
}

/**
 * Code copro lu dans le detail : « [S0302] … » et « S302 - … » donnent "S302". La copro
 * de test SE999 et un detail sans code donnent null.
 */
export function codeCoproDuDetail(detail: string): string | null {
  const m = /\bS0?(\d{3})\b/.exec(detail);
  return m ? `S${m[1]}` : null;
}

/** Libelle de l'envoi : le detail sans le destinataire (« … ~ [0007] DUPONT »). */
export function libelleEnvoi(detail: string): string {
  return detail.replace(/\s*~.*$/, "").trim();
}

/** Un envoi (appel de fonds, mailing, convocation) d'une copro, tous destinataires cumules. */
export interface EnvoiFraisPostaux {
  sourceId: string;
  libelle: string;
  scope: string;
  /** Premier jour d'envoi vu, ISO. */
  dateISO: string;
  /** Categories d'affranchissement rencontrees, ex ["Timbre LRAR"]. */
  categories: string[];
  /** Plis affranchis (timbres + LRE) : un par destinataire. */
  plis: number;
  timbresHtCentimes: number;
  lreHtCentimes: number;
  serviceHtCentimes: number;
  serviceTtcCentimes: number;
}

export interface FraisPostauxCopro {
  coproCode: string;
  /** Du plus ancien au plus recent. */
  envois: EnvoiFraisPostaux[];
  /** Timbres + LRE, HT, tous envois : ce que les factures du 23/10/2026 refacturaient. */
  timbresEtLreHtCentimes: number;
  serviceHtCentimes: number;
  serviceTtcCentimes: number;
}

export interface EnvoiNonRattache {
  sourceId: string;
  libelle: string;
  /** Copros possibles quand l'envoi en couvre plusieurs (un mailing a deux copros). */
  coprosPossibles: string[];
  quantite: number;
  montantTtcCentimes: number;
}

export interface FraisPostauxPeriode {
  parCopro: FraisPostauxCopro[];
  nonRattaches: EnvoiNonRattache[];
}

/**
 * Regroupe les frais d'envoi par copro puis par envoi, pour les seules copros `retenues`
 * (au reel). `coprosDeLaSource` rattache une ligne sans code copro a la copro de son
 * mailing ; un envoi a plusieurs copros reste non rattache (a repartir par destinataire).
 */
export function regrouperFraisPostaux(
  lignes: LigneConsommationEstale[],
  retenues: ReadonlySet<string>,
  coprosDeLaSource: ReadonlyMap<string, string[]> = new Map(),
): FraisPostauxPeriode {
  const parCopro = new Map<string, Map<string, EnvoiFraisPostaux>>();
  const nonRattaches = new Map<string, EnvoiNonRattache>();

  for (const l of lignes) {
    const nature = natureFrais(l.categorie);
    if (!nature) continue;
    // Copro de test ESTALE (SE999) : jamais refacturee, jamais signalee.
    if (/\[?SE\d{3}\b/.test(l.detail)) continue;
    const ht = l.prixUnitaireHtCentimes * l.quantite;
    const ttc = l.prixUnitaireTtcCentimes * l.quantite;

    let code = codeCoproDuDetail(l.detail);
    if (!code) {
      const possibles = coprosDeLaSource.get(l.sourceId) ?? [];
      if (possibles.length === 1) code = possibles[0]!;
      else {
        // Envoi qu'on ne sait pas rattacher : montre seulement s'il peut concerner une
        // copro au reel (ou si on ignore tout de sa source).
        if (possibles.length > 0 && !possibles.some((p) => retenues.has(p))) continue;
        const nr = nonRattaches.get(l.sourceId) ?? {
          sourceId: l.sourceId,
          libelle: libelleEnvoi(l.detail),
          coprosPossibles: possibles,
          quantite: 0,
          montantTtcCentimes: 0,
        };
        nr.quantite += l.quantite;
        nr.montantTtcCentimes += ttc;
        nonRattaches.set(l.sourceId, nr);
        continue;
      }
    }
    if (!retenues.has(code)) continue;

    const envois = parCopro.get(code) ?? new Map<string, EnvoiFraisPostaux>();
    const e = envois.get(l.sourceId) ?? {
      sourceId: l.sourceId,
      libelle: libelleEnvoi(l.detail),
      scope: l.scope,
      dateISO: l.dateISO,
      categories: [],
      plis: 0,
      timbresHtCentimes: 0,
      lreHtCentimes: 0,
      serviceHtCentimes: 0,
      serviceTtcCentimes: 0,
    };
    if (l.dateISO && (!e.dateISO || l.dateISO < e.dateISO)) e.dateISO = l.dateISO;
    if (nature === "service") {
      e.serviceHtCentimes += ht;
      e.serviceTtcCentimes += ttc;
    } else {
      e.plis += l.quantite;
      if (nature === "timbre") e.timbresHtCentimes += ht;
      else e.lreHtCentimes += ht;
      if (!e.categories.includes(l.categorie)) e.categories.push(l.categorie);
    }
    envois.set(l.sourceId, e);
    parCopro.set(code, envois);
  }

  const resultat: FraisPostauxCopro[] = [...parCopro.entries()]
    .map(([coproCode, envois]) => {
      const liste = [...envois.values()].sort(
        (a, b) => a.dateISO.localeCompare(b.dateISO) || a.libelle.localeCompare(b.libelle, "fr"),
      );
      const somme = (f: (e: EnvoiFraisPostaux) => number) => liste.reduce((s, e) => s + f(e), 0);
      return {
        coproCode,
        envois: liste,
        timbresEtLreHtCentimes: somme((e) => e.timbresHtCentimes + e.lreHtCentimes),
        serviceHtCentimes: somme((e) => e.serviceHtCentimes),
        serviceTtcCentimes: somme((e) => e.serviceTtcCentimes),
      };
    })
    .sort((a, b) => a.coproCode.localeCompare(b.coproCode, "fr", { numeric: true }));

  return { parCopro: resultat, nonRattaches: [...nonRattaches.values()] };
}
