// Registre des ressources reservables REAL31 (increment 4 "reservation de salle").
// Logique PURE (domaine, ADR-001) : liste FERMEE de boites Exchange (room mailboxes /
// equipment mailbox) qu'on ajoute comme RESSOURCE d'un evenement Outlook. Les room
// mailboxes auto-acceptent si le creneau est libre. Aucun email n'est jamais invente :
// tout email de ressource passe par cette liste (valide contre RESSOURCES_REAL31).

// Codes d'agence alignes sur la table public."Agency" (name) : ML / LGC / HLS / ASN.
// La salle "JF" n'est pas une agence a part : c'est une annexe de LGC (cf. RESSOURCES_REAL31),
// donc pas de code "JF" ici. ASN n'a pas de salle propre (ses copros passent par le
// debordement "Voir les autres agences").
export type AgenceReunion = "ML" | "LGC" | "HLS" | "ASN";

export interface RessourceReunion {
  /** Adresse SMTP de la boite Exchange (room mailbox / equipment mailbox). */
  email: string;
  /** Libelle lisible affiche dans l'UI. */
  nom: string;
  /** Salle de reunion ou vehicule (la ZOE pour une AG a l'exterieur). */
  type: "salle" | "vehicule";
  /** Agence de rattachement (salles seulement ; un vehicule n'est pas rattache). */
  agence?: AgenceReunion;
  /** Salle de debordement (ex. cuisine) : d'appoint, distinguee dans l'UI. */
  debordement?: boolean;
}

// Liste FERMEE des ressources REAL31. Toute reservation cible une de ces boites.
export const RESSOURCES_REAL31: readonly RessourceReunion[] = [
  { email: "real31lgc@real31.fr", nom: "LGC - Salle de reunions", type: "salle", agence: "LGC" },
  { email: "real31lgc2eme@real31.fr", nom: "LGC - 2eme etage", type: "salle", agence: "LGC" },
  {
    email: "real31lgccuisine@real31.fr",
    nom: "LGC - Cuisine (debordement)",
    type: "salle",
    agence: "LGC",
    debordement: true,
  },
  // Annexe du quartier JF : elle appartient a l'agence LGC (decision Sekou). On garde
  // son email et son nom d'affichage ; seul le TAG d'agence change (JF -> LGC).
  { email: "real31JF@real31.fr", nom: "JF - Salle de reunions", type: "salle", agence: "LGC" },
  { email: "REAL.31.HLS@real31.fr", nom: "HLS - Salles de reunions", type: "salle", agence: "HLS" },
  { email: "REAL31ML@real31.fr", nom: "ML - Salle de reunions", type: "salle", agence: "ML" },
  { email: "zoe@real31.fr", nom: "Voiture ZOE", type: "vehicule" },
];

/** Salles de reunion (type "salle") - pour le selecteur de salle de l'UI. */
export function sallesReunion(): RessourceReunion[] {
  return RESSOURCES_REAL31.filter((r) => r.type === "salle");
}

/** Vehicules reservables (type "vehicule") - la ZOE pour une AG a l'exterieur. */
export function vehicules(): RessourceReunion[] {
  return RESSOURCES_REAL31.filter((r) => r.type === "vehicule");
}

/**
 * Ressource correspondant a un email (comparaison INSENSIBLE a la casse : les
 * adresses SMTP le sont). Renvoie undefined si l'email n'est pas dans la liste
 * fermee - c'est le filet anti "email de ressource invente".
 */
export function ressourceParEmail(email: string | null | undefined): RessourceReunion | undefined {
  if (!email) return undefined;
  const cible = email.trim().toLowerCase();
  return RESSOURCES_REAL31.find((r) => r.email.toLowerCase() === cible);
}

/** Un attendee Graph de type "resource" (salle / vehicule ajoute a un evenement). */
export interface AttendeeRessource {
  type: "resource";
  emailAddress: { address: string };
}

/**
 * Construit les attendees "resource" pour une liste d'emails de salles / vehicules
 * (room mailboxes). Ignore les entrees vides / blanches. Ces attendees, ajoutes a
 * un evenement Outlook, declenchent l'auto-acceptation de la room mailbox si le
 * creneau est libre. Transformation PURE : aucun appel reseau ici.
 */
export function attendeesRessource(emails: string[]): AttendeeRessource[] {
  return emails
    .map((e) => e.trim())
    .filter(Boolean)
    .map((address) => ({ type: "resource", emailAddress: { address } }));
}

/** Un attendee Graph de type "required" (collegue invite a la reunion). */
export interface AttendeeParticipant {
  type: "required";
  emailAddress: { address: string };
}

/**
 * Construit les attendees "required" pour une liste d'emails de collegues
 * (gestionnaires). Ignore les entrees vides / blanches et dedoublonne (insensible a
 * la casse). Ces attendees, ajoutes a un evenement Outlook, le font apparaitre dans
 * l'agenda de chaque collegue. Transformation PURE : aucun appel reseau ici.
 */
export function attendeesParticipant(emails: string[]): AttendeeParticipant[] {
  const vus = new Set<string>();
  const out: AttendeeParticipant[] = [];
  for (const brut of emails) {
    const address = brut.trim();
    if (!address) continue;
    const cle = address.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push({ type: "required", emailAddress: { address } });
  }
  return out;
}

/**
 * Interprete l'`availabilityView` de Graph getSchedule (chaine de chiffres, un par
 * tranche de `availabilityViewInterval` : "0"=libre, "1"=tentative, "2"=occupe,
 * "3"=absent, "4"=inconnu). Regle : un seul caractere != "0" -> le creneau est
 * OCCUPE ; sinon LIBRE. Chaine vide -> libre (aucune tranche occupee).
 * NB : le cas "donnee absente / erreur / 403" est gere par l'adapter (-> "inconnu"),
 * pas ici : cette fonction pure ne raisonne que sur une vue reellement recue.
 */
export function interpreterAvailabilityView(vue: string): "libre" | "occupee" {
  return /[^0]/.test(vue) ? "occupee" : "libre";
}
