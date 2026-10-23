// Écran « Échanges » (REA-15, décision du 12/10/2026) : retrouver un mail, reçu OU envoyé,
// par copro, correspondant, mot ou date, dans la boîte commune de l'agence et dans sa
// propre boîte. Remplace la recherche dans les événements Crypto, en mieux : les envoyés
// y sont, et la recherche par copro passe par les adresses connues de la copro (annuaire
// Crypto + ESTALE), donc elle retrouve aussi les mails jamais étiquetés et l'historique.
// Domaine pur.
//
// QUI VOIT QUOI (Sekou, 12/10) : chacun voit la boîte commune de SON agence et SA boîte ;
// personne ne fouille la boîte d'un collègue, sauf les super-admins pendant le pilote.
// Ouvert d'abord à Houilles seulement : une agence sans boîte configurée n'a pas l'écran.

/** Agence (code court, ex. « HLS ») -> ses boîtes communes. */
export type BoitesParAgence = Record<string, string[]>;

/** « HLS=syndic4@real31.fr;LGC=syndic2@real31.fr,copro2@real31.fr » -> table. */
export function lireBoitesParAgence(brut: string | undefined): BoitesParAgence {
  const out: BoitesParAgence = {};
  for (const bloc of (brut ?? "").split(";")) {
    const [agence, boites] = bloc.split("=");
    const code = agence?.trim().toUpperCase();
    const liste = (boites ?? "").split(",").map((b) => b.trim().toLowerCase()).filter((b) => b.includes("@"));
    if (code && liste.length) out[code] = liste;
  }
  return out;
}

export interface Utilisateur {
  email: string;
  /** Code de l'agence de rattachement, ex. « HLS » ; null si inconnu. */
  agence: string | null;
  superAdmin: boolean;
}

export interface BoiteVisible {
  adresse: string;
  /** « commune » : la boîte de l'agence ; « perso » : celle de l'utilisateur ou d'un collègue (super-admin). */
  nature: "commune" | "perso";
}

/** Les boîtes proposées par défaut. Vide = pas d'accès à l'écran. */
export function boitesVisibles(u: Utilisateur, parAgence: BoitesParAgence): BoiteVisible[] {
  const email = u.email.toLowerCase();
  const communes = u.superAdmin ? [...new Set(Object.values(parAgence).flat())] : u.agence ? (parAgence[u.agence] ?? []) : [];
  if (communes.length === 0 && !u.superAdmin) return [];
  return [
    ...communes.map((adresse) => ({ adresse, nature: "commune" as const })),
    ...(communes.includes(email) ? [] : [{ adresse: email, nature: "perso" as const }]),
  ];
}

const DOMAINE_INTERNE = "@real31.fr";

/** Peut-on lire cette boîte ? Les siennes ; toute boîte du cabinet pour un super-admin (pilote). */
export function boiteAutorisee(boite: string, u: Utilisateur, parAgence: BoitesParAgence): boolean {
  const b = boite.trim().toLowerCase();
  if (u.superAdmin) return b.endsWith(DOMAINE_INTERNE);
  return boitesVisibles(u, parAgence).some((v) => v.adresse === b);
}

export interface CritereEchanges {
  /** Référence de la copro, ex. « S247 » ou « S0300 ». */
  copro?: string;
  /** Adresse ou nom du correspondant. */
  correspondant?: string;
  /** Mots libres (objet, corps, pièces jointes). */
  mots?: string;
  /** Bornes AAAA-MM-JJ incluses. */
  du?: string;
  au?: string;
}

/**
 * La barre de recherche unique de « E-mails » (13/10/2026) : une saisie libre devient des
 * critères. Un code copro (S247, S0300, SE999) -> copro ; une adresse -> correspondant ; le
 * reste -> mots. « S247 dupont@x.fr fuite » = la copro S247, avec Dupont, mot « fuite ».
 */
export function critereDepuisRecherche(saisie: string): CritereEchanges {
  const c: CritereEchanges = {};
  const mots: string[] = [];
  for (const t of saisie.trim().split(/\s+/).filter(Boolean)) {
    if (!c.copro && /^(SE|S)\d{3,4}$/i.test(t)) c.copro = t.toUpperCase();
    else if (!c.correspondant && /^[^\s@]+@[^\s@]+$/.test(t)) c.correspondant = t.toLowerCase();
    else mots.push(t);
  }
  if (mots.length) c.mots = mots.join(" ");
  return c;
}

/** Au-delà, la requête devient trop longue pour l'URL Graph : on la coupe en paquets. */
const ADRESSES_PAR_REQUETE = 15;

// KQL : on retire ce qui casserait la requête (guillemets, parenthèses, opérateurs).
const propre = (s: string) => s.replace(/["()\\]/g, " ").replace(/\s+/g, " ").trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Les requêtes KQL (Graph `$search`) d'une recherche. Une copro se cherche par les
 * adresses qu'on lui connaît OU son code cité ; plusieurs requêtes si elle a beaucoup
 * d'adresses. [] = critère vide (on ne liste pas toute la boîte).
 */
export function requetesKql(c: CritereEchanges, adressesCopro: string[], codesCopro: string[]): string[] {
  const filtres: string[] = [];
  const qui = propre(c.correspondant ?? "");
  if (qui) filtres.push(qui.includes("@") ? `participants:${qui.toLowerCase()}` : `(from:${qui} OR to:${qui} OR cc:${qui})`);
  for (const mot of propre(c.mots ?? "").split(" ").filter((m) => m.length > 1 && !/^(AND|OR|NOT)$/i.test(m))) filtres.push(mot);
  if (c.du && DATE.test(c.du)) filtres.push(`received>=${c.du}`);
  if (c.au && DATE.test(c.au)) filtres.push(`received<=${c.au}`);

  if (!c.copro) return filtres.length ? [filtres.join(" AND ")] : [];

  const codes = [...new Set(codesCopro.map(propre).filter(Boolean))];
  const adresses = [...new Set(adressesCopro.map((a) => propre(a).toLowerCase()).filter((a) => a.includes("@")))];
  const paquets: string[][] = [];
  for (let i = 0; i < adresses.length; i += ADRESSES_PAR_REQUETE) paquets.push(adresses.slice(i, i + ADRESSES_PAR_REQUETE));
  if (paquets.length === 0) paquets.push([]);
  return paquets.map((paquet, i) => {
    // Les codes ne sont cherchés qu'une fois, dans le premier paquet.
    const termes = [...paquet.map((a) => `participants:${a}`), ...(i === 0 ? codes : [])];
    const copro = termes.length === 1 ? termes[0]! : `(${termes.join(" OR ")})`;
    return [copro, ...filtres].join(" AND ");
  });
}

/** Les codes sous lesquels une copro peut être citée : « S0247 » et « S247 ». */
export function codesDeCopro(reference: string): string[] {
  const m = /^(SE|S)0*(\d+)$/i.exec(reference.trim());
  if (!m) return [reference.trim()];
  const prefixe = m[1]!.toUpperCase();
  return [...new Set([`${prefixe}${m[2]}`, `${prefixe}${m[2]!.padStart(4, "0")}`])];
}

export interface EchangeTrouve {
  boite: string;
  id: string;
  internetMessageId: string;
  conversationId?: string;
  objet: string;
  deNom: string;
  deAdresse: string;
  a: string[];
  cc: string[];
  /** Date de réception (ou d'envoi pour un envoyé), ISO. */
  date: string;
  aPiecesJointes: boolean;
  apercu: string;
  lienOutlook?: string;
}

/** Une réponse envoyée depuis la boîte dans le fil d'un mail reçu (bloc « Réponse envoyée »). */
export interface ReponseEnvoyee {
  date: string;
  deNom: string;
  a: string[];
  /** Objet de la réponse partie (REA-408). */
  objet: string;
  /** Le texte écrit, sans le message cité en dessous. */
  corps: string;
  /** Le message cité sous la réponse (l'historique), "" s'il n'y en a pas. Replié à l'écran. */
  historique: string;
  lienOutlook?: string;
}

/**
 * Les envoyés d'une boîte partagée qu'un binôme voit (REA-408) : ceux d'une conversation
 * dont un mail lui a été distribué par le tri. Un envoyé sans conversation connue n'est
 * à personne en particulier : il ne remonte pas. Ordre gardé, `max` au plus.
 */
export function envoyesDuBinome(envoyes: EchangeTrouve[], conversations: ReadonlySet<string>, max: number): EchangeTrouve[] {
  return envoyes.filter((e) => e.conversationId !== undefined && conversations.has(e.conversationId)).slice(0, max);
}

// Début du message cité sous une réponse : en-tête Outlook FR/EN, séparateur, « Le … a écrit ».
const DEBUT_CITATION = /^\s*(?:(?:De|From)\s?:.*$|-{3,}\s*(?:Message d'origine|Original Message)|_{10,}|Le .{5,120} a écrit\s?:|On .{5,120} wrote:)/im;

/** Le texte propre d'une réponse : on coupe le message d'origine cité en dessous. */
export function sansCitation(corps: string): string {
  const texte = corps.replace(/\r\n/g, "\n");
  const i = texte.search(DEBUT_CITATION);
  return (i > 0 ? texte.slice(0, i) : texte).replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Ce que sansCitation retire : le message d'origine cité sous une réponse (REA-408), borné
 * à `max` caractères pour qu'un long fil n'alourdisse pas la page. "" sans citation.
 */
export function citationDe(corps: string, max = 30_000): string {
  const texte = corps.replace(/\r\n/g, "\n");
  const i = texte.search(DEBUT_CITATION);
  if (i <= 0) return "";
  const reste = texte.slice(i).replace(/\n{3,}/g, "\n\n").trim();
  return reste.length > max ? `${reste.slice(0, max)}\n…` : reste;
}

/** La boîte ne répond pas à l'app : hors du groupe autorisé par la DSI (403) ou inexistante. */
export class BoiteNonLisible extends Error {
  constructor(readonly boite: string) {
    super(`La boîte ${boite} n'est pas lisible par l'intranet.`);
  }
}

export type Sens = "recu" | "envoye" | "interne";

/** Envoyé depuis la boîte lue, échangé entre collègues, ou reçu de l'extérieur. */
export function sensDe(e: Pick<EchangeTrouve, "boite" | "deAdresse">): Sens {
  const de = e.deAdresse.toLowerCase();
  if (de === e.boite.toLowerCase()) return "envoye";
  return de.endsWith(DOMAINE_INTERNE) ? "interne" : "recu";
}

/**
 * Un mail rattaché à un dossier (journal du dossier, kind « email ») : la boîte et
 * l'internetMessageId, qui ne change pas quand le mail est déplacé (l'id Graph, si).
 */
export function refEchange(boite: string, internetMessageId: string): string {
  return `echange:${boite.toLowerCase()}|${internetMessageId}`;
}

export function lireRefEchange(ref: string | undefined): { boite: string; internetMessageId: string } | null {
  const m = /^echange:([^|]+)\|(.+)$/.exec(ref ?? "");
  return m ? { boite: m[1]!, internetMessageId: m[2]! } : null;
}

/** Le lien qui rouvre un mail rattaché dans l'écran « Échanges ». */
export function lienEchange(boite: string, internetMessageId: string): string {
  return `/echanges?boite=${encodeURIComponent(boite)}&mid=${encodeURIComponent(internetMessageId)}`;
}

/** La ligne du journal du dossier : qui, quand, quoi. */
export function resumeEchange(e: Pick<EchangeTrouve, "boite" | "deAdresse" | "deNom" | "a" | "objet">): string {
  const s = sensDe(e);
  const qui = s === "envoye" ? `Envoyé à ${e.a.slice(0, 2).join(", ") || "?"}` : `${s === "interne" ? "Message interne" : "Reçu"} de ${e.deNom || e.deAdresse}`;
  return `${qui} : ${e.objet}`;
}

/** Fusionne les résultats de plusieurs requêtes et boîtes : sans doublon, les plus récents d'abord. */
export function fusionnerResultats(listes: EchangeTrouve[][], max: number): EchangeTrouve[] {
  const vus = new Set<string>();
  const out: EchangeTrouve[] = [];
  for (const e of listes.flat()) {
    const cle = `${e.boite}|${e.internetMessageId}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out.sort((x, y) => y.date.localeCompare(x.date)).slice(0, max);
}
