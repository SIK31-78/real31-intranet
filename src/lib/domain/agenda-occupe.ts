// Domaine PUR de l'agenda occupe affiche en fond du calendrier AG/CS (Sekou 2026-09-11).
// Aucune dependance technique : bornage de la periode, regroupement par jour, decoupe des
// evenements qui traversent minuit, fusion des chevauchements.
//
// Volontairement sans sujet ni lieu : la v1 repond a "quand suis-je pris ?". Voir le port
// calendrier-outbound-provider.

/** Un creneau pris, tel qu'il arrive du fournisseur (structurel, sans importer le port :
 *  le domaine ne depend pas des ports - regle boundaries / ADR-001). */
export interface Plage {
  debut: string;
  fin: string;
  journeeEntiere: boolean;
}

/** Les creneaux pris d'UN jour. */
export interface JourOccupe {
  /** Jour 'YYYY-MM-DD'. */
  date: string;
  /** Creneaux du jour, tries, fusionnes, bornes au jour. */
  creneaux: { debut: string; fin: string }[];
  /** Journee entiere prise (conge, deplacement) : s'affiche sans horaire. */
  journeeEntiere: boolean;
  /** Minutes occupees dans la journee (sert au libelle court). */
  minutes: number;
}

/** Fenetre maximale d'une interrogation d'agenda. Une vue mois fait 42 cases au plus
 *  (6 semaines) ; au-dela, c'est un appel qui deborde, pas un besoin d'ecran. */
export const MAX_JOURS_AGENDA = 42;

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;

function plusJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function joursEntre(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000;
}

/**
 * Borne la periode demandee. null si les dates sont illisibles ou a l'envers : on prefere
 * ne rien afficher plutot que d'interroger Graph sur une fenetre absurde.
 * `auExclusif` = lendemain de `au`, la borne haute a passer au fournisseur.
 */
export function bornerPeriodeAgenda(
  duISO: string,
  auISO: string,
): { du: string; au: string; auExclusif: string } | null {
  if (!JOUR_RE.test(duISO) || !JOUR_RE.test(auISO)) return null;
  if (auISO < duISO) return null;
  const etendue = joursEntre(duISO, auISO) + 1;
  const au = etendue > MAX_JOURS_AGENDA ? plusJours(duISO, MAX_JOURS_AGENDA - 1) : auISO;
  return { du: duISO, au, auExclusif: plusJours(au, 1) };
}

/** "2026-09-14T09:30:00" -> 570 (minutes depuis minuit). */
function minutesDe(dateTime: string): number {
  const [h, m] = dateTime.slice(11, 16).split(":").map(Number);
  return h * 60 + m;
}

/**
 * Regroupe les plages par jour, entre `du` et `au` inclus.
 *
 * Une reunion qui traverse minuit (ou un conge de trois jours) est DECOUPEE : chaque jour
 * ne porte que sa part. Sans ca, un conge apparaitrait seulement sur son premier jour et
 * le calendrier mentirait les deux jours suivants.
 *
 * Les creneaux qui se chevauchent sont FUSIONNES : deux reunions 9h-10h et 9h30-11h
 * donnent une seule barre 9h-11h. On affiche de l'occupation, pas une liste de rendez-vous.
 */
export function grouperPlagesParJour(plages: Plage[], du: string, au: string): JourOccupe[] {
  const parJour = new Map<string, { debut: number; fin: number }[]>();
  const journeeEntiere = new Set<string>();

  for (const p of plages) {
    if (!p.debut || !p.fin || p.fin <= p.debut) continue;
    let jour = p.debut.slice(0, 10);
    const dernierJour = p.fin.slice(0, 10);
    // Une fin a minuit pile appartient au jour PRECEDENT (borne exclusive).
    const finExclusiveMinuit = p.fin.slice(11, 16) === "00:00";
    const jourFin = finExclusiveMinuit ? plusJours(dernierJour, -1) : dernierJour;
    // Garde-fou : une plage aberrante ne doit pas faire boucler des annees.
    for (let i = 0; i <= MAX_JOURS_AGENDA && jour <= jourFin; i++, jour = plusJours(jour, 1)) {
      if (jour < du || jour > au) continue;
      const debutMin = jour === p.debut.slice(0, 10) ? minutesDe(p.debut) : 0;
      const finMin = jour === jourFin && !finExclusiveMinuit ? minutesDe(p.fin) : 1440;
      if (finMin <= debutMin) continue;
      if (p.journeeEntiere) journeeEntiere.add(jour);
      const liste = parJour.get(jour) ?? [];
      liste.push({ debut: debutMin, fin: finMin });
      parJour.set(jour, liste);
    }
  }

  const hhmm = (min: number): string =>
    `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

  return [...parJour.entries()]
    .map(([date, bruts]) => {
      const tries = [...bruts].sort((a, b) => a.debut - b.debut || a.fin - b.fin);
      const fusionnes: { debut: number; fin: number }[] = [];
      for (const c of tries) {
        const dernier = fusionnes[fusionnes.length - 1];
        if (dernier && c.debut <= dernier.fin) dernier.fin = Math.max(dernier.fin, c.fin);
        else fusionnes.push({ ...c });
      }
      return {
        date,
        creneaux: fusionnes.map((c) => ({ debut: hhmm(c.debut), fin: hhmm(c.fin) })),
        journeeEntiere: journeeEntiere.has(date),
        minutes: fusionnes.reduce((s, c) => s + (c.fin - c.debut), 0),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Libelle court d'une journee occupee, pour la case du calendrier.
 * Une journee entiere le dit ; sinon on donne le premier creneau, et "+N" s'il y en a
 * d'autres : la case fait 96 px de haut et porte deja les AG/CS.
 */
export function libelleJourOccupe(jour: JourOccupe): string {
  if (jour.journeeEntiere) return "Journée prise";
  const [premier, ...reste] = jour.creneaux;
  if (!premier) return "";
  const base = `${premier.debut}–${premier.fin}`;
  return reste.length > 0 ? `${base} +${reste.length}` : base;
}
