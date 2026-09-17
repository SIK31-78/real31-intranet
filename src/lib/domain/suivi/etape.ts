// NOYAU « suivi d'etapes » : ce que les modules Perte de copropriete et Reprise de
// copropriete ont en commun (audit du 16/09/2026, lot R). Une checklist d'etapes, chacune
// avec un statut, parfois une echeance ; une etape « close » ne compte plus dans le reste a
// faire, une echeance passee sur une etape ouverte est un retard.
//
// Chaque module garde SA checklist, SES phases et SES roles : ici ne vivent que les regles
// qui ne dependent pas du module. Fonctions pures, aucune I/O, aucune horloge (la date du
// jour est fournie par l'appelant).

/** Ordre canonique des statuts (celui du menu de la pastille). */
export const STATUTS_ETAPE = ["a_faire", "en_cours", "bloque", "fait", "ignore"] as const;

/**
 * `bloque` = l'etape ne peut pas avancer (le motif est dans la note) ;
 * `ignore` = sans objet pour ce dossier (la perte l'affiche « Sans objet »).
 */
export type StatutEtape = (typeof STATUTS_ETAPE)[number];

/**
 * Anciens statuts persistes -> statut courant. Le module perte a ecrit `sans_objet` dans son
 * JSONB jusqu'au 17/09/2026 : on le lit comme `ignore`, sans migration ni ecriture de masse
 * (les nouvelles ecritures utilisent `ignore`). Un statut inconnu vaut `a_faire`.
 */
export function normaliserStatut(brut: string): StatutEtape {
  if (brut === "sans_objet") return "ignore";
  return (STATUTS_ETAPE as readonly string[]).includes(brut) ? (brut as StatutEtape) : "a_faire";
}

/** Une etape close (faite ou ignoree) ne compte plus dans le reste a faire. */
export function etapeClose(statut: StatutEtape): boolean {
  return statut === "fait" || statut === "ignore";
}

/** Echeance depassee = date (AAAA-MM-JJ) strictement avant aujourd'hui, sur une etape encore ouverte. */
export function echeanceDepassee(
  etape: { statut: StatutEtape; echeance?: string | null },
  aujourdHuiISO: string,
): boolean {
  return Boolean(etape.echeance) && !etapeClose(etape.statut) && etape.echeance! < aujourdHuiISO.slice(0, 10);
}

/** Nombre d'etapes par statut (les cinq cles sont toujours presentes). */
export function compterParStatut(etapes: ReadonlyArray<{ statut: StatutEtape }>): Record<StatutEtape, number> {
  const n: Record<StatutEtape, number> = { a_faire: 0, en_cours: 0, bloque: 0, fait: 0, ignore: 0 };
  for (const e of etapes) n[e.statut] += 1;
  return n;
}

export interface Avancement {
  /** Etapes closes (faites ou ignorees). */
  faites: number;
  total: number;
}

/** Avancement d'une checklist : etapes closes sur le total, une etape ignoree comptant comme close. */
export function avancement(etapes: ReadonlyArray<{ statut: StatutEtape }>): Avancement {
  return { faites: etapes.filter((e) => etapeClose(e.statut)).length, total: etapes.length };
}

/**
 * L'etape COURANTE, celle qu'un tableau d'equipe met en avant : la premiere `bloque`, sinon
 * la premiere `en_cours`, sinon la premiere `a_faire`. undefined quand tout est clos.
 */
export function etapeCourante<E extends { statut: StatutEtape }>(etapes: ReadonlyArray<E>): E | undefined {
  return (
    etapes.find((e) => e.statut === "bloque") ??
    etapes.find((e) => e.statut === "en_cours") ??
    etapes.find((e) => e.statut === "a_faire")
  );
}

/**
 * La PROCHAINE etape a faire quand les echeances sont calculees (perte : tout se date depuis
 * l'AG) : la plus en retard d'abord, sinon la premiere ouverte dans l'ordre de la checklist.
 * `retardDe` rend le retard en jours d'une etape, ou null si elle n'est pas en retard.
 */
export function prochaineEtape<E extends { statut: StatutEtape }>(
  etapes: ReadonlyArray<E>,
  retardDe: (etape: E) => number | null,
): E | null {
  const ouvertes = etapes.filter((e) => !etapeClose(e.statut));
  if (ouvertes.length === 0) return null;
  const enRetard = ouvertes
    .map((e) => ({ e, r: retardDe(e) ?? -1 }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => b.r - a.r);
  return enRetard[0]?.e ?? ouvertes[0]!;
}
