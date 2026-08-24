// Port (contrat) d'extraction d'un DOCUMENT ANNEXE d'un dossier de reprise. En plus des documents
// canoniques (PV nomination, feuille de presence, RGDD/annexes, EDD+RCP, fiche synthese, grand
// livre), l'ancien syndic transmet des documents VARIABLES mais precieux : liste des
// coproprietaires AVEC EMAILS, courriers portant des precisions importantes, avis de mutation...
// Il n'y a pas de liste fixe : ces documents partaient jusqu'ici "aux deux agents patrimoine par
// securite" (bruit + cout d'IA), et leur valeur reelle (contacts, precisions) etait perdue.
//
// Une SEULE mission par annexe : lire le document (mise en page libre) et en sortir ce qui est
// EXPLOITABLE pour la reprise : des contacts nominatifs (email/telephone) et une synthese courte
// des precisions importantes a connaitre. Abstrait le moteur (mock aujourd'hui : l'adapter
// IA reel a ete supprime a la refonte 2026-08, le port reste pour rebrancher explicitement) comme les autres
// ports d'extraction : le service d'orchestration ne connait que ce contrat.
//
// On reutilise DocumentSource du port d'extraction patrimoine (meme notion de PDF source).
//
// PII : les CONTACTS sont des donnees (nom/email/telephone). Ils circulent dans la structure et
// sont persistes, mais ne doivent JAMAIS partir dans un log (comme le reste de la reprise).

import type { DocumentSource } from "@/lib/reprise/ports/document-source";

/** Un contact nominatif extrait d'une annexe (PII : jamais logue). */
export interface ContactAnnexe {
  /** Nom (et prenom) tel qu'imprime sur le document. */
  nom: string;
  /** Email si present. */
  email?: string;
  /** Telephone si present (fixe ou portable, tel quel). */
  telephone?: string;
}

/** Ce qu'une annexe rend d'exploitable pour la reprise. */
export interface AnnexeExtraite {
  /**
   * Type detecte, LIBRE (l'IA le nomme) : "liste coproprietaires", "courrier", "avis de mutation"...
   * Pas de liste fermee : les annexes n'ont pas de forme fixe.
   */
  typeDetecte: string;
  /** Contacts nominatifs trouves (email/telephone), a rapprocher des owners du jeu. */
  contacts: ContactAnnexe[];
  /** Precisions importantes a connaitre, en points COURTS (remontees en notes de vigilance). */
  pointsAttention: string[];
  /** Resume court du document (une ou deux phrases). */
  resume: string;
}

export interface ExtractionAnnexeProvider {
  /** Analyse UN document annexe (un appel IA par annexe, jamais en masse). */
  extraireAnnexe(doc: DocumentSource): Promise<AnnexeExtraite>;
}
