// Transfert d'un mail de la file du tri à un collègue (REA-500, décision Sekou du 06/11/2026).
//
// Dans la boîte syndic arrivent des mails pour les collègues vente ou location, qui n'ont pas
// accès à cette boîte. Depuis le détail du mail, « Transférer » le leur envoie (pièces jointes
// d'origine comprises), puis le range dans le dossier hors binôme « Transférés ». Règles pures :
//   - destinataires : collègues REAL31 seulement (toute adresse en À et en Cc finit par
//     @real31.fr, estAdresseReal31), 50 au plus, au moins un en « À » ;
//   - la trace « transféré à <adresses> par <qui> » est une note interne du mail (ADR-053) :
//     le journal du tri n'a pas de champ libre, la note suit le mail (internetMessageId) et
//     porte déjà l'auteur et la date.

import { NOTE_LONGUEUR_MAX } from "./boite-equipe";
import { estAdresseReal31 } from "./destinataires-collegues";

/** Au plus 50 destinataires (À et Cc ensemble), comme le transfert de l'écran E-mails. */
export const MAX_DESTINATAIRES_TRANSFERT_TRI = 50;

const normaliser = (l: readonly string[]) => l.map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Les adresses hors REAL31 parmi les destinataires, sans doublon, dans l'ordre saisi. */
export function adressesHorsReal31(a: readonly string[], cc: readonly string[]): string[] {
  return [...new Set(normaliser([...a, ...cc]).filter((e) => !estAdresseReal31(e)))];
}

/** Pourquoi ces destinataires sont refusés, en clair ; null s'ils sont acceptés. */
export function refusDestinatairesTri(a: readonly string[], cc: readonly string[]): string | null {
  const versA = normaliser(a);
  if (versA.length === 0) return "Ajoute au moins un collègue en « À ».";
  if (versA.length + normaliser(cc).length > MAX_DESTINATAIRES_TRANSFERT_TRI) {
    return `Trop de destinataires (${MAX_DESTINATAIRES_TRANSFERT_TRI} maximum).`;
  }
  const externes = adressesHorsReal31(a, cc);
  if (externes.length) {
    const liste = externes.map((e) => `« ${e} »`).join(", ");
    return `Depuis le tri, un mail ne se transfère qu'aux collègues REAL31 (adresses @real31.fr) : ${liste} ${externes.length > 1 ? "sont refusées" : "est refusée"}.`;
  }
  return null;
}

/**
 * Le texte de la note laissée sur le mail transféré : « Transféré à a@real31.fr, b@real31.fr
 * (Cc : c@real31.fr) par Prénom NOM. » Tenu dans la longueur d'une note (50 adresses longues
 * la dépasseraient) : la fin de la liste des adresses cède la place à « … », l'auteur reste.
 */
export function noteDeTransfert(a: readonly string[], cc: readonly string[], par: string): string {
  const copie = normaliser(cc);
  const qui = par.trim();
  const debut = "Transféré à ";
  const fin = `${qui ? ` par ${qui}` : ""}.`;
  let adresses = `${normaliser(a).join(", ")}${copie.length ? ` (Cc : ${copie.join(", ")})` : ""}`;
  const place = NOTE_LONGUEUR_MAX - debut.length - fin.length;
  if (adresses.length > place) adresses = `${adresses.slice(0, place - 1)}…`;
  return `${debut}${adresses}${fin}`;
}
