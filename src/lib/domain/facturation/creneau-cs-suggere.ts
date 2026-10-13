// Le creneau du CS a proposer dans la facturation d'un CS depasse. Fonction pure.
//
// REA-109 : la fenetre s'ouvrait avec une date vide alors que le CS avait eu lieu. La
// cloture de l'ODJ fait GLISSER la date du CS de « prochaine » vers « derniere »
// (cloturer-odj) : facturer le depassement arrive justement apres. On reprend donc la
// prochaine date si elle existe, sinon la derniere tenue.
//
// L'heure de debut vit dans l'horodatage de la date. Depuis REA-109, le glissement fait
// passer la prochaine date en derniere AVEC son heure (derniereCsHeure) : la facture d'un
// CS tenu reprend l'heure reelle. Heure inconnue (CS glisse avant, saisie au jour seul) :
// "" et le formulaire garde son defaut.
// L'heure de fin ne vaut que pour SA date (la confirmation porte la date : un CS
// replanifie ne doit pas heriter de l'heure de fin d'une autre seance).

export interface CreneauCsSuggere {
  /** Jour du CS, ISO "YYYY-MM-DD". */
  jour: string;
  /** Heure de debut "HH:mm" ; "" si inconnue. */
  debut: string;
  /** Heure de fin reelle "HH:mm", si elle a ete saisie a la confirmation de CE jour-la. */
  fin?: string;
}

export function creneauCsSuggere(
  copro:
    | { prochaineCsDate?: string; prochaineCsHeure?: string; derniereCsDate?: string; derniereCsHeure?: string }
    | null
    | undefined,
  confirmationCs: { date: string; heureFin?: string } | undefined,
): CreneauCsSuggere | undefined {
  const prochaine = copro?.prochaineCsDate?.slice(0, 10);
  const jour = prochaine || copro?.derniereCsDate?.slice(0, 10);
  if (!jour) return undefined;
  const debut = (prochaine ? copro?.prochaineCsHeure : copro?.derniereCsHeure) ?? "";
  const fin = confirmationCs?.date === jour ? confirmationCs.heureFin : undefined;
  return { jour, debut, ...(fin ? { fin } : {}) };
}
