// Destinataires collègues (décision 14, 29/10/2026, incident Elsa).
//
// En voulant transférer un mail à Elsa, Mathilde a pris la première « Elsa PEIXOTO » proposée :
// sa fiche de copropriétaire cliente (adresse personnelle), pas sa fiche salariée. Règles, pures :
//   - dans l'autocomplétion, les collègues (adresses @real31.fr de la table User, présents)
//     passent en premier avec le badge « Collègue » ;
//   - une fiche de l'annuaire qui porte le nom d'un collègue est marquée « Client » ;
//   - à l'envoi, une adresse hors @real31.fr d'une personne qui porte le nom d'un collègue
//     déclenche un avertissement dans la confirmation (pas un blocage : Elsa peut être
//     copropriétaire, et on peut vouloir lui écrire à ce titre).

import type { DestinataireTrouve } from "./mes-emails-composition";

/** Un salarié du cabinet tel que l'autocomplétion le propose. */
export interface Collegue {
  nom: string;
  /** Adresse REAL31, en minuscules. */
  email: string;
}

const DOMAINE_REAL31 = "@real31.fr";

export const estAdresseReal31 = (email: string): boolean => email.trim().toLowerCase().endsWith(DOMAINE_REAL31);

// Civilités et liaisons d'une fiche d'annuaire (« M. et Mme PEIXOTO Elsa ») : pas des noms.
const MOTS_VIDES = new Set(["m", "mme", "mlle", "mr", "mrs", "monsieur", "madame", "mademoiselle", "et", "ou"]);

/** Les mots d'un nom, sans accent ni casse, civilités retirées. */
export function motsDuNom(nom: string): string[] {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m && !MOTS_VIDES.has(m));
}

/** Les mots de la partie locale d'une adresse (« elsa.peixoto@gmail.com » -> elsa, peixoto). */
const motsDeLAdresse = (email: string): string[] => motsDuNom((email.split("@")[0] ?? "").replace(/[._-]+/g, " "));

/**
 * Le collègue dont `mots` contient le prénom ET le nom (dans n'importe quel ordre). Un collègue
 * dont le nom tient en un seul mot n'est jamais reconnu : trop de faux positifs.
 */
function collegueDesMots(mots: readonly string[], collegues: readonly Collegue[]): Collegue | null {
  if (!mots.length) return null;
  const ensemble = new Set(mots);
  for (const c of collegues) {
    const siens = motsDuNom(c.nom);
    if (siens.length >= 2 && siens.every((m) => ensemble.has(m))) return c;
  }
  return null;
}

/** Le collègue qui porte ce nom (« PEIXOTO Elsa », « Mme Elsa Peixoto »…), null sinon. */
export function collegueDuNom(nom: string, collegues: readonly Collegue[]): Collegue | null {
  return collegueDesMots(motsDuNom(nom), collegues);
}

/** Le collègue correspond-il à la saisie ? Chaque mot tapé commence un mot de son nom ou de son adresse. */
function collegueCorrespond(c: Collegue, texte: string): boolean {
  const tapes = motsDuNom(texte);
  if (!tapes.length) return false;
  const siens = [...motsDuNom(c.nom), ...motsDeLAdresse(c.email)];
  return tapes.every((t) => siens.some((m) => m.startsWith(t)));
}

/**
 * L'autocomplétion classée : les collègues qui correspondent à la saisie d'abord (badge
 * « Collègue »), puis les fiches de l'annuaire dans leur ordre, marquées « Client » quand elles
 * portent le nom d'un collègue. Une fiche dont toutes les adresses sont celles de collègues
 * proposés fait doublon : elle disparaît.
 */
export function classerDestinataires(
  trouves: readonly DestinataireTrouve[],
  collegues: readonly Collegue[],
  texte: string,
  max = 15,
): DestinataireTrouve[] {
  const retenus = collegues.filter((c) => collegueCorrespond(c, texte));
  const adressesCollegues = new Set(retenus.map((c) => c.email.toLowerCase()));
  const enTete: DestinataireTrouve[] = retenus.map((c) => ({
    cle: `collegue:${c.email.toLowerCase()}`,
    nom: c.nom,
    casquette: "",
    emails: [c.email.toLowerCase()],
    copros: [],
    genre: "collegue",
  }));
  const suite: DestinataireTrouve[] = [];
  for (const d of trouves) {
    const emails = d.emails.map((e) => e.trim().toLowerCase());
    if (emails.length && emails.every((e) => adressesCollegues.has(e))) continue;
    const interne = emails.length > 0 && emails.every(estAdresseReal31);
    const homonyme = !interne && collegueDuNom(d.nom, collegues) !== null;
    suite.push(homonyme ? { ...d, genre: "client" } : d);
  }
  return [...enTete, ...suite].slice(0, max);
}

/**
 * Les avertissements de la confirmation d'envoi : une adresse hors REAL31 d'une personne qui
 * porte le nom d'un collègue (par le nom affiché, ou à défaut par l'adresse elle-même,
 * « elsa.peixoto@gmail.com »). Une phrase par collègue.
 */
export function alertesAdressePersonnelle(
  destinataires: readonly { nom: string; emails: readonly string[] }[],
  collegues: readonly Collegue[],
): string[] {
  const phrases = new Map<string, string>();
  for (const d of destinataires) {
    for (const brute of d.emails) {
      const email = brute.trim().toLowerCase();
      if (!email || estAdresseReal31(email)) continue;
      const c = collegueDuNom(d.nom, collegues) ?? collegueDesMots(motsDeLAdresse(email), collegues);
      if (c && !phrases.has(c.email)) {
        phrases.set(c.email, `${c.nom} : adresse personnelle (${email}), pas son adresse REAL31 (${c.email}).`);
      }
    }
  }
  return [...phrases.values()];
}
