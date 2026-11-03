// Identite d'un syndicat comme client Pennylane, a la forme des clients saisis a la main
// (S300, S302 a S306, relus le 03/11/2026) : PARTICULIER, prenom « SDC », nom « 4 RUE GAULTIER - S305 »,
// en majuscules sans accents ni virgule. Pennylane affiche ensuite « SDC 4 RUE GAULTIER - S305 ».

export interface IdentiteClientPennylane {
  prenom: string;
  nom: string;
  /** Ce que Pennylane affiche : prenom + nom. */
  nomAffiche: string;
}

/** « SDC 18, rue de Sébastopol - S311 » -> prenom « SDC », nom « 18 RUE DE SEBASTOPOL - S311 ». */
export function identiteClientPennylane(nomSdc: string): IdentiteClientPennylane {
  const nom = nomSdc
    .trim()
    .replace(/^SDC\s+/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return { prenom: "SDC", nom, nomAffiche: `SDC ${nom}` };
}
