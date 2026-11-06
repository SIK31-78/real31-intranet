// Transfert d'un mail de la file du tri à un collègue (REA-500, décision Sekou du 06/11/2026).
//
// Dans la boîte syndic arrivent des mails pour les collègues vente ou location, qui n'ont pas
// accès à cette boîte. Depuis le détail du mail, « Transférer » le leur envoie (pièces jointes
// d'origine comprises), puis le range dans le dossier hors binôme « Transférés ». Règles pures :
//   - destinataires : collègues REAL31 seulement (toute adresse en À et en Cc finit par
//     @real31.fr, estAdresseReal31), 50 au plus, au moins un en « À » ;
//   - la trace « transféré à <adresses> par <qui> » est une note interne du mail (ADR-053) :
//     le journal du tri n'a pas de champ libre, la note suit le mail (internetMessageId) et
//     porte déjà l'auteur et la date. L'onglet journal du tri la relit pour dire à qui le mail
//     est parti (destinatairesDeNote, l'inverse de noteDeTransfert ; validé par Sekou le 06/11).

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

const DEBUT_NOTE = "Transféré à ";

/**
 * Le texte de la note laissée sur le mail transféré : « Transféré à a@real31.fr, b@real31.fr
 * (Cc : c@real31.fr) par Prénom NOM. » Tenu dans la longueur d'une note (50 adresses longues
 * la dépasseraient) : la fin de la liste des adresses cède la place à « … », l'auteur reste.
 */
export function noteDeTransfert(a: readonly string[], cc: readonly string[], par: string): string {
  const copie = normaliser(cc);
  const qui = par.trim();
  const debut = DEBUT_NOTE;
  const fin = `${qui ? ` par ${qui}` : ""}.`;
  let adresses = `${normaliser(a).join(", ")}${copie.length ? ` (Cc : ${copie.join(", ")})` : ""}`;
  const place = NOTE_LONGUEUR_MAX - debut.length - fin.length;
  if (adresses.length > place) adresses = `${adresses.slice(0, place - 1)}…`;
  return `${debut}${adresses}${fin}`;
}

const ADRESSE = /^[^\s@,()…]+@[^\s@,()…]+\.[^\s@,()….]+$/;

/** Les adresses entières d'un morceau « a, b, c » ; une adresse coupée par « … » est écartée. */
const adressesDe = (morceau: string): string[] =>
  morceau
    .split(",")
    .map((x) => x.trim().replace(/\.$/, ""))
    .filter((x) => ADRESSE.test(x));

/**
 * L'inverse de noteDeTransfert : les destinataires (À puis Cc) lus dans le texte d'une note
 * « Transféré à a, b (Cc : c) par Prénom NOM. ». null si la note n'est pas une trace de
 * transfert (une note ordinaire de l'équipe) ou n'a aucune adresse lisible. Une note coupée à
 * la longueur maximale perd sa dernière adresse, incomplète, jamais une adresse inventée.
 */
export function destinatairesDeNote(texte: string): { a: string[]; cc: string[] } | null {
  if (!texte.startsWith(DEBUT_NOTE)) return null;
  const reste = texte.slice(DEBUT_NOTE.length);
  // Les adresses n'ont pas d'espace : « (Cc : » et « par » ne peuvent venir que de la note.
  const iCc = reste.indexOf(" (Cc : ");
  const iPar = reste.indexOf(" par ");
  const finA = [iCc, iPar].filter((i) => i >= 0).reduce((m, i) => Math.min(m, i), reste.length);
  const a = adressesDe(reste.slice(0, finA));
  if (a.length === 0) return null;
  let cc: string[] = [];
  if (iCc >= 0 && iCc === finA) {
    const debutCc = iCc + " (Cc : ".length;
    const fermee = reste.indexOf(")", debutCc);
    const finCc = fermee >= 0 ? fermee : iPar > debutCc ? iPar : reste.length;
    cc = adressesDe(reste.slice(debutCc, finCc));
  }
  return { a, cc };
}

/**
 * Les destinataires du transfert d'une ligne du journal (dossier « Transférés »), d'après les
 * notes du mail : la première trace de transfert écrite à partir du rangement (la note suit le
 * rangement de quelques secondes ; un mail annulé puis retransféré a deux lignes et deux
 * notes), à défaut la dernière. Toutes les adresses, À puis Cc ; null sans trace lisible.
 */
export function destinatairesDuTransfert(
  notes: readonly { texte: string; creeLe: string }[],
  rangeLe: string,
): string[] | null {
  const traces = notes
    .map((n) => ({ creeLe: n.creeLe, d: destinatairesDeNote(n.texte) }))
    .filter((t): t is { creeLe: string; d: { a: string[]; cc: string[] } } => t.d !== null)
    .sort((x, y) => Date.parse(x.creeLe) - Date.parse(y.creeLe));
  if (!traces.length) return null;
  const depuis = Date.parse(rangeLe);
  const t = traces.find((x) => Date.parse(x.creeLe) >= depuis) ?? traces[traces.length - 1]!;
  return [...new Set([...t.d.a, ...t.d.cc])];
}
