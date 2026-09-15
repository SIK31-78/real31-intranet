// Service : le contrat GENERE qui attend son AG (ou son recap), par copropriete.
//
// C'est ce que le recap AG propose en pre-remplissage du bloc « Nouveau contrat de
// gestion » (Sekou, 14/09/2026) : jusqu'ici le gestionnaire retapait de tete debut,
// honoraires et timbres - et l'historique MYTHEC montre 56 copros ou base et contrat
// signe divergent. On part du document imprime ; l'AG peut avoir vote autrement, le
// gestionnaire corrige, et l'ecran le lui montre.
//
// Ne retient que les etats « genere » et « recap-a-faire » : un contrat deja acte par
// un recap, ou une copro sans contrat, n'a rien a proposer.

import { listerContratsAPreparer } from "./lister-contrats";

export interface ContratGenere {
  /** AG pour laquelle le contrat a ete edite. */
  dateAgISO: string | null;
  /** Cycle imprime ; a defaut (editions MYTHEC), le cycle que l'intranet propose. */
  debutISO: string;
  finISO: string;
  honorairesTtc: number | null;
  forfaitPostauxTtc: number | null;
  fraisPostauxReels: boolean;
  editeLeISO: string;
  par: string | null;
}

/** Par code copro, pour le portefeuille du gestionnaire. Vide si la base est indisponible. */
export async function listerContratsGeneres(
  managerId: string,
  aujourdhuiISO: string,
): Promise<Map<string, ContratGenere>> {
  const resultat = new Map<string, ContratGenere>();
  try {
    const lignes = await listerContratsAPreparer(managerId, aujourdhuiISO);
    for (const l of lignes) {
      if (l.etat !== "genere" && l.etat !== "recap-a-faire") continue;
      const e = l.derniereEdition;
      if (!e) continue;
      resultat.set(l.coproCode, {
        dateAgISO: e.dateAgISO,
        debutISO: e.debutISO ?? l.debutISO,
        finISO: e.finISO ?? l.finISO,
        honorairesTtc: e.honorairesTtc,
        forfaitPostauxTtc: e.forfaitPostauxTtc,
        fraisPostauxReels: e.fraisPostauxReels,
        editeLeISO: e.creeLeISO,
        par: e.par,
      });
    }
  } catch (err) {
    console.warn(`[contrats-generes] lecture impossible : ${(err as Error).message}`);
  }
  return resultat;
}
