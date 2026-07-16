// Limites d'upload du module reprise, ALIGNEES sur les limites reelles des API d'extraction
// (audit API 2026-07-16, P1-8). Domaine PUR (aucune I/O) : importable par les routes ET par les
// composants client (pre-verification AVANT l'upload, message actionnable au lieu d'un 413 API
// apres des minutes d'attente).
//
// Raisonnement des plafonds :
//   - API Anthropic : 32 Mo par requete, et un PDF part en base64 (gonfle x1,37), prompt et
//     enveloppe JSON en plus -> au-dela d'~23 Mo de PDF envoyes a une mission, l'appel echoue
//     (413) APRES l'upload complet et l'attente. On borne a 20 Mo (marge sous ~23 Mo) pour
//     echouer AVANT, avec un message clair.
//   - claude-haiku-4-5 (mission proprietaires, contexte 200K) : 100 pages de PDF max par
//     requete cote API. Les PDF d'une analyse partent ENTIERS dans chaque mission -> plafond
//     100 pages sur le lot envoye a l'IA (verifie cote route quand le moteur est Claude).
//   - Mistral (data-url) : plafonds du meme ordre de grandeur ; la borne 20 Mo couvre aussi.
//
// Le GRAND LIVRE n'est PAS concerne par ces bornes IA : il part au pipeline COUCHE TEXTE
// (pdfjs local, zero appel reseau). Sa seule contrainte est la RAM du process -> plafond
// global distinct (le lot complet est lu en memoire le temps de l'analyse).

/** Plafond RAM : taille TOTALE du lot (tous documents), lu entierement en memoire. */
export const TAILLE_TOTALE_MAX_OCTETS = 40 * 1024 * 1024;
export const TAILLE_TOTALE_MAX_LABEL = "40 Mo";

/** Plafond API IA : taille cumulee des documents envoyes a Claude/Mistral (hors grand livre). */
export const TAILLE_IA_MAX_OCTETS = 20 * 1024 * 1024;
export const TAILLE_IA_MAX_LABEL = "20 Mo";

/** Plafond API Anthropic : pages de PDF max par requete sur un modele 200K (haiku-4-5). */
export const PAGES_IA_MAX = 100;

/** Octets -> Mo arrondis a l'entier superieur (pour les messages utilisateur). */
export function enMo(octets: number): number {
  return Math.ceil(octets / (1024 * 1024));
}

/**
 * Un nom de fichier designe-t-il un GRAND LIVRE ? Aiguillage par nom de fichier (conservateur) :
 * "grand livre" / "grand_livre" / "grandlivre" ou le sigle "GL" isole. Insensible a la casse.
 * (Deplace ici depuis services/analyser-dossier pour que les composants client puissent
 * pre-verifier les plafonds sans embarquer les services dans le bundle ; `estGrandLivre`
 * y reste re-exporte pour les appelants existants.)
 */
export function estNomGrandLivre(nom: string): boolean {
  const n = nom.toLowerCase();
  if (/grand[\s_-]*livre/.test(n)) return true;
  // "GL" comme mot isole (gl.pdf, gl_2025.pdf, S0302-GL.pdf), pas au milieu d'un mot (ex. "angle").
  return /(^|[\s_-])gl($|[\s_.-])/.test(n);
}
