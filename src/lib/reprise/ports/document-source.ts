// Type PARTAGE des ports du module reprise : un document verse par le gestionnaire.
//
// Historiquement defini dans ports/extraction-provider.ts (le port de l'extraction IA du
// patrimoine, supprime lors de la refonte "entree par fichiers Excel" - git garde l'histoire).
// Le type, lui, sert toujours : la reprise COMPTA (grand livre PDF, couche texte) et les
// documents annexes transportent leurs octets par ce contrat.

/** Un document source verse (PDF du syndic sortant, xlsx patrimoine...). */
export interface DocumentSource {
  /** Nom de fichier d'origine (sert d'indice d'aiguillage : "grand livre.pdf", "lots.xlsx"...). */
  nom: string;
  /** Octets du document. */
  contenu: Uint8Array;
  /** Type MIME (defaut application/pdf). */
  mime?: string;
}
