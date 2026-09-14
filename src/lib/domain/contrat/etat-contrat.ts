// Ou en est le contrat de syndic d'une copropriete dans son cycle de vie.
//
// LE PARCOURS (Sekou et son patron, 11-14/09/2026) : le montant est negocie en reunion
// de CS, le contrat est GENERE au moment de la convocation pour etre insere dedans, l'AG
// le vote, puis le RECAP AG ouvre le nouveau cycle dans le suivi des contrats. C'est le
// recap qui « acte » le contrat - pas la generation, qui n'est qu'une proposition.
//
// Trois sources, croisees ici sans base :
//   - la prochaine AG planifiee (referentiel) ;
//   - la derniere edition REUSSIE du contrat et la date d'AG qu'elle porte (historique
//     MYTHEC puis editions intranet) ;
//   - le jour ou le dernier cycle a ete ENREGISTRE (ce que le recap a ecrit).
//
// Pourquoi la date d'enregistrement et pas le debut du cycle : le mandat vote en AG
// demarre souvent AVANT elle (au 1er du mois, retroactif - FOCH44LGC : AG le 07/07,
// cycle au 01/07). Tester « un cycle qui commence apres l'AG » declarait a tort le
// recap non fait sur 4 copros du portefeuille test.
// Fonction pure, deterministe.

export type EtatContrat =
  /** AG a venir, aucun contrat edite pour elle : c'est le travail du module. */
  | "a-generer"
  /** AG a venir, le contrat qui la concerne est edite : il ne reste qu'a attendre l'AG. */
  | "genere"
  /** L'AG s'est tenue avec un contrat edite, mais aucun cycle n'a ete ouvert depuis :
   *  le recap AG n'a pas ete fait. Ce n'est pas au module contrat de le faire, mais
   *  c'est a lui de le dire - sinon la copro semble simplement « sans AG ». */
  | "recap-a-faire"
  /** Rien a faire tant qu'une AG n'est pas planifiee. C'est aussi l'etat ou retombe une
   *  copro dont le recap a acte le contrat : elle attend l'AG suivante. */
  | "a-planifier";

export interface EntreesEtatContrat {
  aujourdhuiISO: string;
  /** Prochaine AG du referentiel, ISO, ou null. Peut etre DANS LE PASSE (jamais glissee). */
  prochaineAgISO: string | null;
  /** Date d'AG portee par la derniere edition reussie, ou null si jamais edite. */
  derniereEditionAgISO: string | null;
  /** Jour ou le dernier cycle du suivi des contrats a ete enregistre, ou null. */
  dernierCycleEnregistreLeISO: string | null;
}

export function etatContrat(e: EntreesEtatContrat): EtatContrat {
  const agAVenir = e.prochaineAgISO !== null && e.prochaineAgISO >= e.aujourdhuiISO;

  if (agAVenir) {
    // Une edition ne compte que si elle porte LA date de cette AG : un contrat edite pour
    // une AG qu'on a ensuite deplacee affiche une mauvaise date, il est a refaire.
    return e.derniereEditionAgISO === e.prochaineAgISO ? "genere" : "a-generer";
  }

  // Pas d'AG a venir. Si un contrat a ete edite pour une AG deja passee et qu'aucun
  // cycle n'a ete enregistre DEPUIS cette AG (le jour meme compris), le recap n'a pas
  // ete fait.
  const agTenue = e.derniereEditionAgISO !== null && e.derniereEditionAgISO <= e.aujourdhuiISO;
  const cycleEnregistreDepuis =
    e.dernierCycleEnregistreLeISO !== null &&
    e.derniereEditionAgISO !== null &&
    e.dernierCycleEnregistreLeISO >= e.derniereEditionAgISO;
  if (agTenue && !cycleEnregistreDepuis) return "recap-a-faire";

  return "a-planifier";
}
