// Quelles boites de reception un gestionnaire voit-il dans "Mes e-mails" ?
// Domaine pur (ADR-001) : la construction de la liste ne lit PAS l'environnement,
// elle recoit la config brute en parametre -> testable sans process.env.
//
// V1.2 (decision Sekou 2026-08-18) : DEUX boites distinctes, jamais fusionnees --
// la boite personnelle du gestionnaire et les boites partagees d'agence (syndic2...).
// Conception multi-boites des le depart (decision 8) : la boite est une DONNEE de
// configuration, jamais une constante dans le code.

/** Une boite de reception affichee dans le module. */
export interface BoiteMail {
  /** Identifiant stable cote UI et cote persistance = l'adresse en minuscules. */
  id: string;
  /** Adresse complete, ex "syndic2@real31.fr". */
  adresse: string;
  /** Libelle affiche dans le rail, ex "Ma boîte" ou "syndic2". */
  libelle: string;
  /** true = boite personnelle du connecte ; false = boite partagee d'agence. */
  personnelle: boolean;
  /**
   * Boîte perso d'un titulaire ouverte par une délégation de portefeuille : « Fanny S. »
   * (complément d'ADR-041, 27/10/2026). Absent : ma boîte, ou une boîte partagée.
   */
  pour?: string;
}

function normaliser(adresse: string): string {
  return adresse.trim().toLowerCase();
}

/** Libelle court d'une boite partagee : la partie avant le @ ("syndic2@real31.fr" -> "syndic2"). */
function libelleCourt(adresse: string): string {
  return adresse.split("@")[0] || adresse;
}

/**
 * Construit la liste des boites visibles. La boite personnelle vient TOUJOURS en
 * premier (c'est celle que le gestionnaire connait deja) ; les partagees suivent
 * dans l'ordre de la configuration.
 *
 * @param emailGestionnaire adresse SSO du connecte ; vide/absent => aucune boite.
 * @param partageesBrut liste separee par des virgules (ex. "syndic2@real31.fr").
 */
export function construireBoites(
  emailGestionnaire: string | undefined,
  partageesBrut: string | undefined,
): BoiteMail[] {
  const perso = normaliser(emailGestionnaire ?? "");
  const boites: BoiteMail[] = [];

  if (perso) {
    boites.push({ id: perso, adresse: perso, libelle: "Ma boîte", personnelle: true });
  }

  const vues = new Set(boites.map((b) => b.id));
  for (const brut of (partageesBrut ?? "").split(",")) {
    const adresse = normaliser(brut);
    // Une partagee identique a la perso serait un doublon exact dans le rail.
    if (!adresse || !adresse.includes("@") || vues.has(adresse)) continue;
    vues.add(adresse);
    boites.push({ id: adresse, adresse, libelle: libelleCourt(adresse), personnelle: false });
  }

  return boites;
}

/**
 * Une boite est-elle autorisee pour ce gestionnaire ? Sert de GARDE cote serveur :
 * l'adresse d'envoi ("De :") arrive du client et ne doit jamais etre crue sur parole.
 */
export function boiteAutorisee(boites: BoiteMail[], adresse: string): boolean {
  const cible = normaliser(adresse);
  return boites.some((b) => b.id === cible);
}

/** La boite par defaut pour REPONDRE a un mail : celle qui l'a recu (le fil reste
 *  unifie sur la boite partagee, decision Sekou 6). Repli sur la boite personnelle. */
export function boiteReponseParDefaut(boites: BoiteMail[], boiteDuMail: string | undefined): string {
  if (boiteDuMail && boiteAutorisee(boites, boiteDuMail)) return normaliser(boiteDuMail);
  return boites.find((b) => b.personnelle)?.id ?? boites[0]?.id ?? "";
}
