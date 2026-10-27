// L'historique cité sous un mail reçu, découpé message par message. Jusqu'au 27/10/2026,
// l'écran rendait le texte cité d'un seul bloc : un fil de six échanges se lisait comme un
// mur. On repère les en-têtes que les clients mail laissent dans la citation (Outlook en
// français et en anglais, « Le … a écrit : », les séparateurs) et on rend un message par
// en-tête. Pur : aucune dépendance, testable tel quel.

export interface MessageCite {
  /** Expéditeur tel qu'écrit dans l'en-tête (« Jean Dupont <jean@x.fr> »), null sans en-tête. */
  de: string | null;
  /** Date telle qu'écrite (« lundi 13 octobre 2026 14:05 »), sans interprétation. */
  date: string | null;
  /** Destinataires (champ À / To) tels qu'écrits. */
  a: string | null;
  objet: string | null;
  corps: string;
}

// Lignes qui séparent deux messages sans rien dire d'eux : Outlook les met avant l'en-tête.
const SEPARATEUR = /^\s*(?:_{5,}|-{2,}\s*(?:message d'origine|original message|message original)\s*-{2,})\s*$/i;
// Un champ d'en-tête Outlook, en français ou en anglais. « A » sans accent : certains
// exports perdent l'accent du « À ».
const CHAMP = /^\s*(De|From|Envoy[ée]|Sent|Date|À|A|To|Cc|Objet|Subject)\s*:\s*(.*)$/i;
const DEBUT_EN_TETE = /^\s*(?:De|From)\s*:/i;
// « Le 13 oct. 2026 à 14:05, Jean Dupont <jean@x.fr> a écrit : » (Gmail, Apple Mail, Thunderbird)
// et « On Mon, Oct 13, 2026 at 2:05 PM Jean Dupont <jean@x.fr> wrote: ».
const A_ECRIT = /^\s*(?:Le|On)\s+(.+?)\s+(?:a\s*[ée]crit|wrote)\s*:\s*$/i;

type EnTete = Omit<MessageCite, "corps">;

const SANS_EN_TETE: EnTete = { de: null, date: null, a: null, objet: null };

/** L'en-tête Outlook qui commence à la ligne `i`, et l'index de la première ligne du corps. */
function lireEnTeteOutlook(lignes: string[], i: number): { enTete: EnTete; suite: number } | null {
  if (!DEBUT_EN_TETE.test(lignes[i] ?? "")) return null;
  const champs = new Map<string, string>();
  let j = i;
  // Les champs se suivent ; une ligne vide entre deux champs arrive (export HTML -> texte).
  while (j < lignes.length && j < i + 10) {
    const ligne = lignes[j]!;
    if (ligne.trim() === "" && champs.size > 0) {
      j++;
      continue;
    }
    const m = CHAMP.exec(ligne);
    if (!m) break;
    champs.set(m[1]!.toLowerCase(), m[2]!.trim());
    j++;
  }
  // Un « De : » seul dans une phrase n'est pas un en-tête : il faut au moins un autre champ.
  if (champs.size < 2) return null;
  const valeur = (...cles: string[]) => {
    for (const c of cles) {
      const v = champs.get(c);
      if (v) return v;
    }
    return null;
  };
  return {
    enTete: {
      de: valeur("de", "from"),
      date: valeur("envoyé", "envoye", "sent", "date"),
      a: valeur("à", "a", "to"),
      objet: valeur("objet", "subject"),
    },
    suite: j,
  };
}

/**
 * « Le <date>, <qui> a écrit : » / « On <date> <qui> wrote: ». La frontière entre la date et
 * l'auteur : la dernière virgule, ou la fin de l'heure (« 9:00 AM Jean Dupont » en anglais, où
 * les virgules sont dans la date), la plus tardive des deux. Sans l'une ni l'autre, tout est date.
 */
function lireAEcrit(ligne: string): EnTete | null {
  const m = A_ECRIT.exec(ligne);
  if (!m) return null;
  const tout = m[1]!.trim();
  let coupe = tout.lastIndexOf(",");
  const heure = [...tout.matchAll(/\d{1,2}:\d{2}(?:\s*[AP]M)?/gi)].pop();
  if (heure && heure.index + heure[0].length > coupe) coupe = heure.index + heure[0].length;
  if (coupe === -1) return { ...SANS_EN_TETE, date: tout };
  const date = tout.slice(0, coupe).replace(/,\s*$/, "").trim();
  const de = tout.slice(coupe).replace(/^,\s*/, "").trim();
  return { ...SANS_EN_TETE, date: date || null, de: de || null };
}

/** Retire les chevrons de citation (« > > texte ») et l'espace vertical en trop. */
function nettoyerCorps(lignes: string[]): string {
  return lignes
    .map((l) => l.replace(/^(\s*>)+ ?/, ""))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Découpe le texte cité en messages, dans l'ordre où ils sont cités (le plus récent d'abord,
 * c'est ainsi qu'Outlook empile). Un texte sans marque reconnue donne un seul message sans
 * en-tête ; un texte vide, aucun.
 */
export function decouperHistorique(texte: string): MessageCite[] {
  const lignes = texte.replace(/\r\n?/g, "\n").split("\n");
  // Les chevrons d'un client qui cite ligne à ligne ne doivent pas cacher un en-tête.
  const nues = lignes.map((l) => l.replace(/^(\s*>)+ ?/, ""));
  const messages: MessageCite[] = [];
  let enTete: EnTete = SANS_EN_TETE;
  let corps: string[] = [];
  let aUnEnTete = false;

  const clore = () => {
    const c = nettoyerCorps(corps);
    if (c || aUnEnTete) messages.push({ ...enTete, corps: c });
    corps = [];
  };

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]!;
    const nue = nues[i]!;
    if (SEPARATEUR.test(nue)) {
      clore();
      enTete = SANS_EN_TETE;
      aUnEnTete = false;
      continue;
    }
    const outlook = lireEnTeteOutlook(nues, i);
    if (outlook) {
      clore();
      enTete = outlook.enTete;
      aUnEnTete = true;
      i = outlook.suite - 1;
      continue;
    }
    const aEcrit = lireAEcrit(nue);
    if (aEcrit) {
      clore();
      enTete = aEcrit;
      aUnEnTete = true;
      continue;
    }
    corps.push(ligne);
  }
  clore();
  return messages;
}
