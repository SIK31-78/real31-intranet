// Repli SUR du port de signature : ne renvoie JAMAIS de signature.
//
// Ce n'est PAS un mock : c'est le contraire. Il existe pour qu'un envoi REEL ne parte
// jamais avec la signature cannee de MockSignatureProvider.
//
// Incident du 2026-07-28 (Sekou) : un mail au conseil syndical est parti depuis la vraie
// boite d'un vrai gestionnaire, vers de vrais destinataires, avec la signature de
// demonstration ("REAL31 - Gestionnaire de copropriete", www.real31.fr). Cause : le
// routeur bascule sur le mock des que SIGNITIC_API_KEY est absente A L'EXECUTION, sans
// regarder si le provider de mail est reel. Le mock avait ete ecrit "pour tester le rendu
// dans le cockpit sans cle Signitic" -- un usage de dev qui n'a rien a faire dans un envoi
// reel.
//
// Regle retenue : mieux vaut AUCUNE signature qu'une FAUSSE. Une signature manquante se
// voit et se corrige ; une fausse signature engage le cabinet aupres de ses clients.

import type { SignatureProvider } from "@/lib/ports/signature-provider";

// Une seule trace par process : le cas est anormal (cle absente alors que le mail reel est
// branche) et merite d'etre vu dans les logs, mais pas a chaque envoi.
let dejaSignale = false;

export class SansSignatureProvider implements SignatureProvider {
  async getSignatureHtml(): Promise<string | null> {
    if (!dejaSignale) {
      dejaSignale = true;
      console.warn(
        "[signature] SIGNITIC_API_KEY absente alors que l'envoi de mail REEL est actif : " +
          "les mails partent SANS signature (la signature de demonstration est volontairement " +
          "refusee en envoi reel).",
      );
    }
    return null;
  }
}
