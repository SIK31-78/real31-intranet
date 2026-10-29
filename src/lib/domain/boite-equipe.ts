// Boîte d'équipe de l'écran E-mails (chantier du 29/10/2026, décisions 5, 6 et 9) : qui
// s'occupe d'un mail (attribution), ce que l'équipe s'en dit (notes internes) et quand il doit
// revenir (en attente, relance). Domaine pur : règles de droit, validation, calcul du retour
// dans « À traiter ». Aucune lecture, aucune date implicite (`maintenant` est toujours passé).
//
// Clés (ADR-053) :
// - une NOTE suit le mail partout : clé = internetMessageId seul (le mail garde cet identifiant
//   quand il change de dossier, part en Comptabilité ou bascule d'une boîte à l'autre) ;
// - une ATTRIBUTION et une ATTENTE sont un état de la file où le mail se trouve : clé =
//   (internetMessageId, boîte), et le dossier du tri au moment du geste (`dossierCle`). Quand le
//   mail change de dossier (Comptabilité, « Pas pour moi » vers un autre binôme) ou de boîte
//   (bascule), elles ne valent plus : la nouvelle équipe le reçoit libre, sans attente.

import type { BinomesTri, DossierHorsBinome } from "./tri-emails";

const minuscules = (e: string) => e.trim().toLowerCase();

/** Un collaborateur tel qu'il s'affiche sur une pastille ou dans « Attribuer à… ». */
export interface MembreEquipe {
  /** En minuscules. */
  email: string;
  nomComplet: string;
  initiales: string;
}

/** Ce qui identifie un mail dans une file : son internetMessageId et la boîte qui le détient. */
export interface CleMail {
  internetMessageId: string;
  /** En minuscules. */
  boite: string;
}

/** Où se trouve le mail au moment où on le regarde (ou au moment du geste). */
export interface ContexteMail extends CleMail {
  /**
   * Clé du dossier du tri (`binome:…`, `comptabilite`…) d'après le rangement actif du journal.
   * null = pas de rangement connu (mail ancien, boîte perso) ; undefined = pas cherché.
   */
  dossierCle?: string | null;
}

export function cleMail(internetMessageId: string, boite: string): CleMail {
  return { internetMessageId: internetMessageId.trim(), boite: minuscules(boite) };
}

// --- Attribution (décision 5) ----------------------------------------------------------------

export type GesteAttribution = "prendre" | "attribuer" | "retirer" | "reponse";

export interface Attribution extends CleMail {
  /** Dossier du tri au moment du geste : l'attribution ne vaut que dans ce dossier. */
  dossierCle: string | null;
  attributaire: MembreEquipe;
  /** Qui a fait le geste (l'attributaire lui-même pour « Je prends » et la réponse). */
  parEmail: string;
  parInitiales: string;
  /** ISO. */
  le: string;
  geste: Exclude<GesteAttribution, "retirer">;
}

export interface LigneHistoriqueAttribution extends CleMail {
  dossierCle: string | null;
  geste: GesteAttribution;
  /** null pour « retirer ». */
  attributaireEmail: string | null;
  parEmail: string;
  le: string;
}

const COMPTABILITE: DossierHorsBinome = "comptabilite";

/** Le dossier du tri est-il celui de la Comptabilité (onglet des comptables) ? */
export function estDossierComptabilite(dossierCle: string | null | undefined): boolean {
  return dossierCle === COMPTABILITE;
}

/**
 * Les adresses du binôme qui tient ce dossier du tri : gestionnaire et assistant(e). La clé
 * `binome:<email>` est celle du binôme principal du gestionnaire (ou du gestionnaire seul) ;
 * `binome:<id>` celle d'un binôme secondaire (cf. cleDossierDe). Vide pour un dossier hors
 * binôme (Comptabilité, Divers, bascule) ou inconnu.
 */
export function membresDuDossier(dossierCle: string | null | undefined, b: BinomesTri): string[] {
  if (!dossierCle?.startsWith("binome:")) return [];
  const reste = dossierCle.slice("binome:".length);
  if (reste.includes("@")) {
    const g = minuscules(reste);
    const principal = b.binomes.find((x) => x.gestionnaireEmail === g && x.principal);
    return principal ? [g, minuscules(principal.assistant.email)] : [g];
  }
  const binome = b.binomes.find((x) => x.id === reste);
  if (!binome) return [];
  return [binome.gestionnaireEmail, minuscules(binome.assistant.email)];
}

/**
 * Qui peut être attributaire d'un mail : les comptables pour un mail en Comptabilité, sinon
 * les membres du binôme du dossier où il est rangé. Sans doublon, dans l'ordre reçu.
 */
export function attributairesPossibles(
  dossierCle: string | null | undefined,
  b: BinomesTri,
  comptables: readonly string[],
): string[] {
  const liste = estDossierComptabilite(dossierCle) ? comptables.map(minuscules) : membresDuDossier(dossierCle, b);
  return [...new Set(liste.filter(Boolean))];
}

/**
 * Le geste d'attribution est-il permis ? null = oui, sinon le message à montrer. L'acteur a déjà
 * passé la garde de la boîte (il voit le mail) : il peut toujours le prendre pour lui (un
 * remplaçant par délégation, un super-admin). Pour le confier à quelqu'un d'autre, la personne
 * doit être de l'équipe du mail (binôme du dossier, ou comptable en Comptabilité).
 */
export function refusAttribution(p: { acteurEmail: string; cibleEmail: string; possibles: readonly string[] }): string | null {
  const acteur = minuscules(p.acteurEmail);
  const cible = minuscules(p.cibleEmail);
  if (!cible) return "Choisis la personne à qui confier ce mail.";
  if (cible === acteur) return null;
  if (p.possibles.map(minuscules).includes(cible)) return null;
  return "Cette personne n'est pas de l'équipe de ce mail (binôme de la copropriété, ou comptables pour la Comptabilité).";
}

/**
 * Un état de file (attribution, attente) vaut-il encore pour le mail tel qu'il est maintenant ?
 * Même boîte, et même dossier du tri quand les deux sont connus. Un dossier inconnu d'un côté
 * (mail plus ancien que la fenêtre du journal, super-admin qui ne lit pas tous les dossiers) ne
 * l'invalide pas : on ne fait pas disparaître une attribution faute de savoir.
 */
export function etatDeFileEnVigueur(stocke: CleMail & { dossierCle: string | null }, courant: ContexteMail): boolean {
  if (stocke.boite !== minuscules(courant.boite)) return false;
  if (stocke.internetMessageId !== courant.internetMessageId.trim()) return false;
  if (!stocke.dossierCle || !courant.dossierCle) return true;
  return stocke.dossierCle === courant.dossierCle;
}

/** Le filtre « À moi / Non attribués / Tous » d'un mail de boîte commune. */
export type FiltreAttribution = "a-moi" | "non-attribues" | "tous";

export function passeLeFiltre(filtre: FiltreAttribution, attributaireEmail: string | null | undefined, moiEmail: string): boolean {
  if (filtre === "tous") return true;
  if (!attributaireEmail) return filtre === "non-attribues";
  return filtre === "a-moi" && minuscules(attributaireEmail) === minuscules(moiEmail);
}

/**
 * Où un mail « à traiter » compte, une fois l'attribution livrée (décision 1, révision de Sekou
 * du 29/10/2026 : le chiffre est PERSONNEL). « moi » : attribué à moi, le chiffre principal ;
 * « a-repartir » : non attribué, le second chiffre discret (« 3 à répartir ») ; null : attribué
 * à un collègue, dans aucun de mes chiffres. Le mail mis en attente ou de côté est sorti avant.
 */
export function placeDansMesChiffres(attributaireEmail: string | null | undefined, moiEmail: string): "moi" | "a-repartir" | null {
  if (!attributaireEmail) return "a-repartir";
  return minuscules(attributaireEmail) === minuscules(moiEmail) ? "moi" : null;
}

// --- Notes internes (décision 6) -------------------------------------------------------------

export const NOTE_LONGUEUR_MAX = 2000;

export interface NoteInterne {
  id: string;
  internetMessageId: string;
  /** Boîte où la note a été écrite (information : la note suit le mail partout). */
  boite: string;
  auteurId: string;
  auteurEmail: string;
  auteurNom: string;
  auteurInitiales: string;
  texte: string;
  /** ISO. */
  creeLe: string;
  /** ISO, null si jamais modifiée. */
  modifieLe: string | null;
}

/**
 * Le texte d'une note, prêt à enregistrer : espaces de bord retirés, fins de ligne unifiées,
 * trois lignes vides de suite ramenées à une. Vide ou trop long : refus lisible.
 */
export function validerTexteNote(brut: string): { ok: true; texte: string } | { ok: false; erreur: string } {
  const texte = (brut ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!texte) return { ok: false, erreur: "La note est vide." };
  if (texte.length > NOTE_LONGUEUR_MAX) {
    return { ok: false, erreur: `Note trop longue : ${NOTE_LONGUEUR_MAX} caractères au plus (${texte.length} saisis).` };
  }
  return { ok: true, texte };
}

/** Seul l'auteur d'une note la modifie ou la supprime. */
export function peutModifierNote(note: Pick<NoteInterne, "auteurId">, acteurId: string): boolean {
  return Boolean(acteurId) && note.auteurId === acteurId;
}

/** Les notes d'un mail, de la plus ancienne à la plus récente (fil court). */
export function trierNotes<T extends Pick<NoteInterne, "creeLe" | "id">>(notes: readonly T[]): T[] {
  return [...notes].sort((a, b) => a.creeLe.localeCompare(b.creeLe) || a.id.localeCompare(b.id));
}

// --- En attente et relance (décision 9) ------------------------------------------------------

/**
 * « attente » : un mail REÇU sort de « À traiter » jusqu'à la date, ou plus tôt si une réponse
 * arrive dans le fil. Sans date, c'est « Mettre de côté » (ajout de Sekou du 29/10/2026) : le
 * mail sort du chiffre et reste dans le filtre « De côté » jusqu'à ce qu'on le reprenne ; une
 * réponse dans le fil ne le ramène pas (la réponse est elle-même un mail à traiter).
 * « relance » : un mail ENVOYÉ revient dans « À traiter » à la date s'il n'y a pas eu de
 * réponse ; une réponse arrivée clôt la relance (c'est elle qu'on traite). Toujours datée.
 */
export type NatureAttente = "attente" | "relance";

export interface Attente extends CleMail {
  nature: NatureAttente;
  /** ISO : la date de retour ; null = « de côté » (attente sans date, jamais pour une relance). */
  jusquAu: string | null;
  /** Conversation Graph du mail : sert à voir une réponse arrivée dans le fil. */
  conversationId: string | null;
  dossierCle: string | null;
  /**
   * ISO : à partir de quand un message reçu dans le fil compte comme une réponse. La pose de
   * l'attente pour un mail reçu ; l'envoi du mail pour une relance.
   */
  depuis: string;
  parEmail: string;
  parInitiales: string;
  poseLe: string;
}

/** Un message reçu dans une conversation (journal du tri, ou liste affichée). */
export interface RecuDansFil {
  internetMessageId: string;
  conversationId: string;
  /** ISO. */
  recuLe: string;
}

export type StatutAttente =
  /** Hors de « À traiter » jusqu'à la date. */
  | "en-attente"
  /** Revenu dans « À traiter ». */
  | "a-traiter"
  /** Relance devenue sans objet : la réponse est arrivée (elle est dans « À traiter »). */
  | "close";

export interface EtatAttente {
  statut: StatutAttente;
  /** Pourquoi le mail est revenu ou la relance s'est close. */
  motif: "date" | "reponse" | null;
}

/**
 * Le dernier message reçu dans le fil de ce mail APRÈS `depuis`, en ignorant le mail lui-même
 * (un mail réaffecté reçoit une nouvelle ligne au journal, ce n'est pas une réponse). null si
 * aucun, ou si le fil n'est pas connu.
 */
export function reponseDansFil(
  a: Pick<Attente, "internetMessageId" | "conversationId" | "depuis">,
  recus: readonly RecuDansFil[],
): string | null {
  if (!a.conversationId) return null;
  let dernier: string | null = null;
  for (const r of recus) {
    if (r.conversationId !== a.conversationId || r.internetMessageId === a.internetMessageId) continue;
    if (r.recuLe <= a.depuis) continue;
    if (!dernier || r.recuLe > dernier) dernier = r.recuLe;
  }
  return dernier;
}

/**
 * Ce mail en attente doit-il revenir dans « À traiter » maintenant ?
 * - attente (mail reçu) : oui à la date, ou dès qu'une réponse arrive dans le fil ;
 * - relance (mail envoyé) : oui à la date s'il n'y a pas eu de réponse ; une réponse arrivée
 *   la clôt (la réponse, elle, est dans « À traiter »).
 */
export function etatAttente(a: Attente, maintenant: Date, recus: readonly RecuDansFil[] = []): EtatAttente {
  if (a.jusquAu === null) {
    // De côté : jusqu'à ce qu'on le reprenne. Une relance sans date n'existe pas (refusée à
    // l'écriture) ; lue quand même, elle reste en attente plutôt que de surgir.
    return { statut: "en-attente", motif: null };
  }
  const reponse = reponseDansFil(a, recus);
  if (a.nature === "relance") {
    if (reponse) return { statut: "close", motif: "reponse" };
    return Date.parse(a.jusquAu) <= maintenant.getTime() ? { statut: "a-traiter", motif: "date" } : { statut: "en-attente", motif: null };
  }
  if (reponse) return { statut: "a-traiter", motif: "reponse" };
  return Date.parse(a.jusquAu) <= maintenant.getTime() ? { statut: "a-traiter", motif: "date" } : { statut: "en-attente", motif: null };
}

/** Choix rapides de « En attente jusqu'au… » / « Relancer si pas de réponse dans… ». */
export type ChoixEcheance = "demain" | "3-jours" | "semaine";

/** Le menu « En attente » : de côté (sans date), un choix rapide, ou un jour. */
export type ChoixAttente = "de-cote" | ChoixEcheance | { jour: string };

/**
 * La date de retour d'un choix du menu « En attente » : null pour « De côté ». Une relance a
 * toujours une date (« Relancer si pas de réponse dans… »).
 */
export function echeanceDuChoix(
  choix: ChoixAttente,
  nature: NatureAttente,
  maintenant: Date,
): { ok: true; jusquAu: string | null } | { ok: false; erreur: string } {
  if (choix === "de-cote") {
    return nature === "relance" ? { ok: false, erreur: "Une relance a besoin d'une date." } : { ok: true, jusquAu: null };
  }
  return echeanceAttente(choix, maintenant);
}

const JOURS_DU_CHOIX: Record<ChoixEcheance, number> = { demain: 1, "3-jours": 3, semaine: 7 };

/** Heure de retour d'un mail en attente : le matin, avant que la journée commence. */
export const HEURE_RETOUR = 8;

/** Le jour (AAAA-MM-JJ) à Paris de cet instant. */
export function jourParis(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
}

/** 08:00 heure de Paris ce jour-là (AAAA-MM-JJ), en ISO UTC. null si le jour est illisible. */
export function matinParis(jour: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour.trim());
  if (!m) return null;
  const [an, mois, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const midiUtc = new Date(Date.UTC(an, mois - 1, j, 12));
  if (midiUtc.getUTCDate() !== j || midiUtc.getUTCMonth() !== mois - 1) return null;
  const heureParis = Number(midiUtc.toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }));
  return new Date(Date.UTC(an, mois - 1, j, HEURE_RETOUR - (heureParis - 12))).toISOString();
}

function jourPlus(jour: string, n: number): string {
  const [an, mois, j] = jour.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(an, mois - 1, j + n, 12)).toISOString().slice(0, 10);
}

/** Au plus loin : un an. Au-delà, ce n'est plus une attente, c'est un classement. */
export const ATTENTE_MAX_JOURS = 366;

/**
 * La date de retour d'un choix rapide ou d'un jour saisi (AAAA-MM-JJ), à 08:00 heure de Paris.
 * Refus lisible si le jour est passé (aujourd'hui compris : on choisit au moins demain) ou à plus
 * d'un an.
 */
export function echeanceAttente(
  choix: ChoixEcheance | { jour: string },
  maintenant: Date,
): { ok: true; jusquAu: string } | { ok: false; erreur: string } {
  const aujourdhui = jourParis(maintenant);
  const jour = typeof choix === "string" ? jourPlus(aujourdhui, JOURS_DU_CHOIX[choix]) : choix.jour.trim();
  const iso = matinParis(jour);
  if (!iso) return { ok: false, erreur: "Date illisible." };
  if (jour <= aujourdhui) return { ok: false, erreur: "Choisis une date à partir de demain." };
  if (jour > jourPlus(aujourdhui, ATTENTE_MAX_JOURS)) return { ok: false, erreur: "Une attente dure un an au plus." };
  return { ok: true, jusquAu: iso };
}

// --- État agrégé d'un mail pour la liste et le compteur ---------------------------------------

export interface EtatEquipeMail {
  internetMessageId: string;
  /** null = non attribué (ou attribution d'un autre dossier / d'une autre boîte). */
  attributaire: MembreEquipe | null;
  /** Nombre de notes internes (0 : rien ne s'affiche). */
  notes: number;
  /**
   * L'attente ou la relance en vigueur, avec son statut maintenant ; null sans attente.
   * `deCote` : attente sans date (filtre « De côté »).
   */
  attente: (Pick<Attente, "nature" | "jusquAu" | "parInitiales" | "poseLe"> & EtatAttente & { deCote: boolean }) | null;
  /** Mail REÇU en attente (datée, pas encore revenu) ou de côté : il sort du chiffre. */
  horsATraiter: boolean;
  /** Mail ENVOYÉ dont la relance est due (date passée, pas de réponse) : il entre dans « À traiter ». */
  relanceDue: boolean;
}

/**
 * L'état d'équipe d'un mail, à partir de ce qui est stocké et de l'endroit où il se trouve.
 * Une attribution ou une attente d'un autre dossier / d'une autre boîte est ignorée.
 */
export function etatEquipe(p: {
  contexte: ContexteMail;
  attribution: Attribution | null | undefined;
  notes: number;
  attente: Attente | null | undefined;
  maintenant: Date;
  recus?: readonly RecuDansFil[];
}): EtatEquipeMail {
  const attribution = p.attribution && etatDeFileEnVigueur(p.attribution, p.contexte) ? p.attribution : null;
  const attente = p.attente && etatDeFileEnVigueur(p.attente, p.contexte) ? p.attente : null;
  const etat = attente ? etatAttente(attente, p.maintenant, p.recus ?? []) : null;
  return {
    internetMessageId: p.contexte.internetMessageId.trim(),
    attributaire: attribution ? attribution.attributaire : null,
    notes: Math.max(0, p.notes),
    attente: attente && etat ? { nature: attente.nature, jusquAu: attente.jusquAu, parInitiales: attente.parInitiales, poseLe: attente.poseLe, deCote: attente.jusquAu === null, ...etat } : null,
    horsATraiter: attente?.nature === "attente" && etat?.statut === "en-attente",
    relanceDue: attente?.nature === "relance" && etat?.statut === "a-traiter",
  };
}
