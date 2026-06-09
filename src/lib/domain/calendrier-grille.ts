// Utilitaires purs de grille calendrier (vues mois et semaine).
// Manipulation via Date UTC pour rester deterministe quel que soit le fuseau serveur.

export interface JourGrille {
  /** ISO "YYYY-MM-DD". */
  date: string;
  /** Numero du jour dans son mois (1-31). */
  numero: number;
  /** Vrai si le jour appartient a un autre mois (cellules de remplissage). */
  horsMois: boolean;
  /** Vrai si le jour correspond a aujourd'hui. */
  estAujourdhui: boolean;
}

export interface SemaineGrille {
  /** 7 jours du lundi au dimanche. */
  jours: JourGrille[];
}

export interface MoisGrille {
  annee: number;
  /** 0-11 (convention JS Date). */
  mois: number;
  /** 6 semaines fixes : hauteur stable en navigation. */
  semaines: SemaineGrille[];
}

export const JOURS_COURT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;

const MOIS_NOMS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const JOURS_LONG = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const j = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

function ajouteJours(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return formatISO(d);
}

/** Indice du jour dans la semaine, 0=lundi a 6=dimanche. */
function indiceJour(iso: string): number {
  const js = parseISO(iso).getUTCDay();
  return (js + 6) % 7;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Grille mois sur 6 semaines, du lundi au dimanche. */
export function moisGrille(annee: number, mois: number, aujourdhuiISO: string): MoisGrille {
  const premier = formatISO(new Date(Date.UTC(annee, mois, 1)));
  const debut = ajouteJours(premier, -indiceJour(premier));
  const semaines: SemaineGrille[] = [];
  for (let s = 0; s < 6; s++) {
    const jours: JourGrille[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = ajouteJours(debut, s * 7 + i);
      const d = parseISO(iso);
      jours.push({
        date: iso,
        numero: d.getUTCDate(),
        horsMois: d.getUTCMonth() !== mois,
        estAujourdhui: iso === aujourdhuiISO,
      });
    }
    semaines.push({ jours });
  }
  return { annee, mois, semaines };
}

/** Semaine de 7 jours contenant la date donnee. */
export function semaineGrille(dateISO: string, aujourdhuiISO: string): SemaineGrille {
  const debut = ajouteJours(dateISO, -indiceJour(dateISO));
  const jours: JourGrille[] = [];
  for (let i = 0; i < 7; i++) {
    const iso = ajouteJours(debut, i);
    const d = parseISO(iso);
    jours.push({
      date: iso,
      numero: d.getUTCDate(),
      horsMois: false,
      estAujourdhui: iso === aujourdhuiISO,
    });
  }
  return { jours };
}

/** Libelle "Mai 2026" pour l'en-tete de vue mois. */
export function libelleMois(annee: number, mois: number): string {
  return `${capitalise(MOIS_NOMS[mois])} ${annee}`;
}

/** Libelle "25 - 31 mai 2026" ou "29 mai - 4 juin 2026". */
export function libelleSemaine(semaine: SemaineGrille): string {
  const debut = parseISO(semaine.jours[0].date);
  const fin = parseISO(semaine.jours[6].date);
  const mDebut = MOIS_NOMS[debut.getUTCMonth()];
  const mFin = MOIS_NOMS[fin.getUTCMonth()];
  const jDebut = debut.getUTCDate();
  const jFin = fin.getUTCDate();
  const aFin = fin.getUTCFullYear();
  if (debut.getUTCMonth() === fin.getUTCMonth()) return `${jDebut} - ${jFin} ${mDebut} ${aFin}`;
  if (debut.getUTCFullYear() === fin.getUTCFullYear()) return `${jDebut} ${mDebut} - ${jFin} ${mFin} ${aFin}`;
  return `${jDebut} ${mDebut} ${debut.getUTCFullYear()} - ${jFin} ${mFin} ${aFin}`;
}

/** Libelle long "Vendredi 29 mai" pour une date ISO. */
export function libelleJourLong(iso: string): string {
  const d = parseISO(iso);
  return `${JOURS_LONG[indiceJour(iso)]} ${d.getUTCDate()} ${MOIS_NOMS[d.getUTCMonth()]}`;
}

/** Mois voisin pour la navigation vue mois. */
export function moisVoisin(annee: number, mois: number, direction: 1 | -1): { annee: number; mois: number } {
  const m = mois + direction;
  if (m < 0) return { annee: annee - 1, mois: 11 };
  if (m > 11) return { annee: annee + 1, mois: 0 };
  return { annee, mois: m };
}

/** ISO de la semaine voisine (decalee de 7 jours). */
export function semaineVoisine(dateISO: string, direction: 1 | -1): string {
  return ajouteJours(dateISO, direction * 7);
}
