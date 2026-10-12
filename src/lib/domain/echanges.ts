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
