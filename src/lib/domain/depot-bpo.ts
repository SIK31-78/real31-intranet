// Domaine : le dépôt des factures des copros Crypto pour BPO (règles de Sekou du 19/10/2026,
// bouton « Pour BPO » de l'écran E-mails, 02/11/2026). Fonctions pures.
//
// Bibliothèque « Documents communs » du site « Syndic » (sites/copro), dossier
// Compta/<LGC|ML>/<année>/<MM-mois>/<JJ-MM>/<initiales>/.
// - HLS n'a pas de dossier : sa compta passe par LGC.
// - Les dossiers datés sont créés à l'avance (environ un jour sur deux, du lundi au vendredi).
//   On dépose dans le dossier du JOUR s'il existe, sinon dans le PROCHAIN dossier daté qui
//   existe ; jamais dans un dossier passé (la personne qui collecte peut oublier de le renommer).
// - Un dossier collecté est renommé « JJ-MM BPO OK le JJ-MM » : on n'y dépose jamais.
// - Le sous-dossier des initiales n'est jamais créé d'office : s'il manque, on choisit parmi
//   ceux qui existent.
// - Seules les copros Crypto passent par là : les bordereaux des copros ESTALE vont dans ESTALE.

/** La racine du dépôt dans la bibliothèque. */
export const RACINE_BPO = "Compta";

/** Le dossier « Compta/<code> » d'une agence ; null : l'agence n'a pas de dépôt BPO connu. */
export function dossierAgenceBpo(agence: string | null | undefined): "LGC" | "ML" | null {
  const a = (agence ?? "").trim().toUpperCase();
  if (a === "LGC" || a === "HLS") return "LGC";
  if (a === "ML") return "ML";
  return null;
}

/** Un jour du calendrier (sans heure), en heure de Paris côté appelant. */
export interface Jour {
  annee: number;
  /** 1 à 12. */
  mois: number;
  jour: number;
}

const DEUX = (n: number) => String(n).padStart(2, "0");
const rang = (j: Jour) => j.annee * 10_000 + j.mois * 100 + j.jour;

/** Le jour de Paris d'un instant (le dépôt suit le calendrier du cabinet, pas UTC). */
export function jourDeParis(instant: Date): Jour {
  const [annee, mois, jour] = instant
    .toLocaleDateString("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .split("-")
    .map(Number);
  return { annee: annee!, mois: mois!, jour: jour! };
}

/**
 * Le dossier du mois dans le dossier de l'année : « 11-novembre », « 08-aout » (l'accent manque
 * parfois), voire « 11 ». On le reconnaît par son numéro, jamais par le nom du mois.
 */
export function dossierDuMois(noms: readonly string[], mois: number): string | null {
  const mm = DEUX(mois);
  return noms.find((n) => n.trim() === mm || new RegExp(`^${mm}\\s*-`).test(n.trim())) ?? null;
}

/** Un dossier déjà collecté et renommé (« 30-10 BPO OK le 31-10 ») : jamais de dépôt. */
export function estCollecte(nom: string): boolean {
  return /bpo\s*ok/i.test(nom);
}

/**
 * Le jour d'un dossier daté « JJ-MM » rangé dans le dossier de `annee` / `mois` ; null pour tout
 * autre nom (collecté, « 02-11 bis », un fichier, un mois qui ne correspond pas).
 */
export function jourDuDossier(nom: string, annee: number, mois: number): Jour | null {
  if (estCollecte(nom)) return null;
  const m = /^(\d{2})-(\d{2})$/.exec(nom.trim());
  if (!m) return null;
  const jour = Number(m[1]);
  if (Number(m[2]) !== mois || jour < 1 || jour > 31) return null;
  return { annee, mois, jour };
}

/** Un dossier daté candidat, lu dans SharePoint. */
export interface DossierDate {
  nom: string;
  /** Le chemin du dossier depuis la racine de la bibliothèque. */
  chemin: string[];
  jour: Jour;
}

/**
 * LA règle : le dossier du jour s'il existe, sinon le prochain dossier daté qui existe ; jamais
 * un dossier passé, jamais un dossier collecté (déjà écarté par jourDuDossier). null : aucun
 * dossier à venir (ils n'ont pas encore été créés), l'écran le dit au lieu de déposer ailleurs.
 */
export function choisirDossierBpo(candidats: readonly DossierDate[], aujourdhui: Jour): DossierDate | null {
  const auj = rang(aujourdhui);
  let meilleur: DossierDate | null = null;
  for (const c of candidats) {
    if (estCollecte(c.nom) || rang(c.jour) < auj) continue;
    if (!meilleur || rang(c.jour) < rang(meilleur.jour)) meilleur = c;
  }
  return meilleur;
}

/** Les mois à lire pour trouver le prochain dossier : celui du jour et le suivant (fin de mois, fin d'année). */
export function moisALire(aujourdhui: Jour): { annee: number; mois: number }[] {
  const suivant = aujourdhui.mois === 12 ? { annee: aujourdhui.annee + 1, mois: 1 } : { annee: aujourdhui.annee, mois: aujourdhui.mois + 1 };
  return [{ annee: aujourdhui.annee, mois: aujourdhui.mois }, suivant];
}

/**
 * Le sous-dossier proposé : celui des initiales de la personne s'il existe (sans casse), sinon
 * aucun (la personne choisit parmi les existants ; on n'en crée jamais).
 */
export function sousDossierParDefaut(existants: readonly string[], initiales: string | null | undefined): string | null {
  const i = (initiales ?? "").trim().toUpperCase();
  if (!i) return null;
  return existants.find((n) => n.trim().toUpperCase() === i) ?? null;
}

/** Le nom de fichier déposé : celui de la pièce, sans caractère interdit par SharePoint. */
export function nomFichierBpo(nom: string): string {
  const propre = nom.replace(/[\\/:*?"<>|#%]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (propre || "piece-jointe").slice(0, 200);
}
