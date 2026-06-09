// Jours feries francais (metropole). Calcul deterministe en UTC.
// Fixes + feries mobiles bases sur Paques (algorithme de Meeus/Gregorien anonyme).

function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ensemble des jours feries (ISO "YYYY-MM-DD") d'une annee donnee. */
export function joursFeries(annee: number): Set<string> {
  const feries = new Set<string>();
  // Feries fixes : [mois, jour].
  const fixes: [number, number][] = [
    [1, 1], [5, 1], [5, 8], [7, 14], [8, 15], [11, 1], [11, 11], [12, 25],
  ];
  for (const [mois, jour] of fixes) {
    feries.add(iso(new Date(Date.UTC(annee, mois - 1, jour))));
  }
  // Feries mobiles depuis Paques.
  const p = paques(annee);
  for (const offset of [1, 39, 50]) {
    // Lundi de Paques (+1), Ascension (+39), Lundi de Pentecote (+50).
    const d = new Date(p);
    d.setUTCDate(d.getUTCDate() + offset);
    feries.add(iso(d));
  }
  return feries;
}
