// Limites d'upload du module reprise. Domaine PUR (aucune I/O) : importable par les routes ET
// par les composants client (pre-verification AVANT l'upload, message actionnable au lieu d'un
// 413 API apres l'attente).
//
// Depuis la refonte "entree par fichiers Excel" (2026-08), plus AUCUN plafond IA : le
// patrimoine est parse localement (xlsx) et le grand livre est lu par la couche texte (pdfjs
// local). La seule contrainte est la RAM du process (le lot est lu en memoire) + le mur Vercel.

// LE MUR VERCEL (production) - honnetete, pas de contournement :
//   Vercel plafonne le BODY d'une requete serverless a ~4,5 Mo, AVANT que notre code ne tourne
//   (la plateforme coupe : la fonction n'est jamais appelee, le navigateur ne recoit qu'un 413
//   opaque). Nos plafonds ci-dessus (40 Mo / 20 Mo) sont donc DES PLAFONDS DE POSTE LOCAL : en
//   production, un lot de 10 Mo echouera meme pour un admin.
//   La vraie solution est l'upload DIRECT vers Supabase Storage (le body ne passe plus par la
//   fonction) : c'est un chantier de fond, PAS traite ici. En attendant, on echoue TOT et CLAIR,
//   cote client, avec un message qui dit quoi faire - plutot qu'un echec opaque apres l'upload.

/** Plafond du lot en PRODUCTION : marge sous les ~4,5 Mo de body serverless Vercel. */
export const TAILLE_UPLOAD_MAX_PROD_OCTETS = 4 * 1024 * 1024;
export const TAILLE_UPLOAD_MAX_PROD_LABEL = "4 Mo";

/** Plafond RAM : taille TOTALE du lot (tous documents), lu entierement en memoire. */
export const TAILLE_TOTALE_MAX_OCTETS = 40 * 1024 * 1024;
export const TAILLE_TOTALE_MAX_LABEL = "40 Mo";

/** Octets -> Mo arrondis a l'entier superieur (pour les messages utilisateur). */
export function enMo(octets: number): number {
  return Math.ceil(octets / (1024 * 1024));
}

/**
 * Le lot COMPLET passe-t-il le plafond de l'environnement ? Renvoie null si c'est bon, sinon LE
 * message a afficher (actionnable, il dit quoi faire).
 *
 * `production` = NODE_ENV === "production" cote appelant (client ET route : meme verdict, meme
 * phrase). En local on garde les plafonds actuels (40 Mo) ; en production, le mur Vercel (~4,5 Mo
 * de body serverless) prime sur tout le reste - on echoue AVANT l'upload.
 */
export function verifierTailleLot(octets: number, production: boolean): string | null {
  if (production && octets > TAILLE_UPLOAD_MAX_PROD_OCTETS) {
    return (
      `Lot de ${enMo(octets)} Mo : en production l'upload est limite a ~${TAILLE_UPLOAD_MAX_PROD_LABEL} ` +
      `(contrainte Vercel : le corps d'une requete serverless est coupe a ~4,5 Mo, avant meme d'arriver ` +
      `a l'application). Analyse ce dossier depuis le poste local, scinde les PDF, ou attends la mise en ` +
      `place du stockage direct (upload vers Supabase Storage).`
    );
  }
  if (octets > TAILLE_TOTALE_MAX_OCTETS) {
    return `Documents trop volumineux : ${enMo(octets)} Mo au total, plafond ${TAILLE_TOTALE_MAX_LABEL}. Retire des fichiers ou analyse en plusieurs fois.`;
  }
  return null;
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
