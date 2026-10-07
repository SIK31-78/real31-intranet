// =============================================================================
// DOMAINE du PONT remontees <-> Linear : la table de correspondance entre le
// cycle de vie d'une remontee (domain/feedback.ts) et les etats Linear.
// Module PUR : zero I/O, zero SDK -> testable offline.
// =============================================================================
//
// POURQUOI CE MODULE : Sekou juge dans Linear ("ca vaut le coup ou non"), donc
// LINEAR EST LA SOURCE DE VERITE DU CYCLE DE VIE. Le retour du cron court-circuite
// volontairement `verifierTransition` : un ticket qui passe de Done a In Progress
// dans Linear doit pouvoir ramener la remontee de `livre` a `en_cours`, alors que
// le domaine interdit cette transition cote app (livre est terminal). Ce n'est pas
// un oubli - c'est le prix du "une seule saisie", et il est confine ici.
//
// ON MAPPE SUR LE `type` DE L'ETAT, JAMAIS SUR SON NOM : renommer "In Progress",
// ajouter un "In Review" ou traduire les etats en francais ne doit rien casser.

import type { Feedback, SeveriteFeedback, StatutFeedback, TypeFeedback } from "./feedback";
import { decoderPageFeedback, estArchivee, LIBELLES_APPLICATION } from "./feedback";

/**
 * Les `type` d'etat que Linear expose sur un WorkflowState. `duplicate` n'est pas
 * documente parmi les types standards mais l'API le rend bien pour l'etat
 * "Duplicate" de l'equipe REAL31 (releve le 2026-10-06) : on le traite.
 */
export const TYPES_ETAT_LINEAR = [
  "triage",
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
  "duplicate",
] as const;
export type TypeEtatLinear = (typeof TYPES_ETAT_LINEAR)[number];

/**
 * LA table de correspondance etat Linear -> statut remontee.
 *
 *   triage            -> nouveau   (ca arrive, pas encore juge)
 *   backlog           -> prevu     (juge bon, pas planifie)
 *   unstarted (Todo)  -> prevu     (juge bon, planifie)
 *   started (In Progress, In Review) -> en_cours
 *   completed (Done)  -> livre     (+ livre_at = completedAt)
 *   canceled / duplicate -> ecarte (+ raison, cf. raisonEcartDepuisLinear)
 *
 * POURQUOI `backlog` VAUT `prevu` (bascule du 2026-10-07, Triage active dans
 * l'equipe) : au depart les deux valaient `nouveau`, et Backlog portait donc
 * DEUX sens contradictoires - « jamais regarde » pour un ticket fraichement
 * cree, et « regarde, pas maintenant » pour un ticket que Sekou y deplace en
 * triant. Consequence vue en vrai : il a sorti 8 sujets ODJ de Todo vers
 * Backlog, le cron les a ramenes a `nouveau`, et ils ont disparu de
 * /nouveautes alors qu'il venait precisement de les juger.
 *
 * Triage leve l'ambiguite : l'arrivee a son propre etat, Backlog redevient un
 * jugement. `prevu` et non `en_cours` parce que rien n'est commence - c'est le
 * meme sens que Todo, la planification en moins, et le domaine n'a pas de
 * statut intermediaire (en ajouter un se verrait sur la vitrine pour rien).
 */
const STATUT_PAR_ETAT: Record<TypeEtatLinear, StatutFeedback> = {
  triage: "nouveau",
  backlog: "prevu",
  unstarted: "prevu",
  started: "en_cours",
  completed: "livre",
  canceled: "ecarte",
  duplicate: "ecarte",
};

export function estTypeEtatLinear(v: string): v is TypeEtatLinear {
  return (TYPES_ETAT_LINEAR as readonly string[]).includes(v);
}

/**
 * Statut a appliquer pour un `type` d'etat Linear. `undefined` si le type est
 * inconnu : dans ce cas le cron NE TOUCHE PAS au statut (un etat custom cree dans
 * Linear ne doit pas silencieusement ecarter une remontee).
 */
export function statutDepuisEtatLinear(typeEtat: string): StatutFeedback | undefined {
  return estTypeEtatLinear(typeEtat) ? STATUT_PAR_ETAT[typeEtat] : undefined;
}

/**
 * Raison d'ecart posee quand Linear annule un ticket. Le domaine EXIGE une raison
 * non vide pour `ecarte` (`raison_ecart_requise`) et Linear n'en fournit aucune :
 * on trace la provenance plutot que d'inventer un motif. La raison lisible par le
 * collaborateur passe, elle, par `resumePublic` (redige a la main au triage).
 */
export function raisonEcartDepuisLinear(identifiant: string, nomEtat: string): string {
  return `${nomEtat} dans Linear (${identifiant})`;
}

/**
 * Type d'etat Linear dans lequel FAIRE NAITRE le ticket, deduit du statut actuel
 * de la remontee.
 *
 * SANS CA, LE PONT EFFACE LE TRIAGE DEJA FAIT (bug trouve a la simulation du premier
 * passage, 2026-10-06) : l'aller creerait le ticket dans l'etat par defaut de
 * l'equipe, et le retour du meme passage ramenerait a `nouveau` une remontee deja
 * `prevu` ou `en_cours` - 25 des 67 remontees a pousser etaient dans ce cas. Elles
 * auraient en plus disparu de /nouveautes, `nouveau` n'etant pas un statut public.
 *
 * Une remontee `nouveau` naît en TRIAGE depuis le 2026-10-07 : Linear n'y met
 * d'office que ce qui vient d'une integration ou d'un non-membre de l'equipe, et
 * nos tickets sont crees par l'API avec la cle de Sekou, donc en tant que membre -
 * il faut demander l'etat explicitement, sinon ils tomberaient en Backlog, qui
 * vaut maintenant `prevu` et serait donc PUBLIE sans avoir ete juge.
 */
export function etatLinearPourStatut(statut: StatutFeedback): TypeEtatLinear {
  if (statut === "prevu") return "unstarted";
  if (statut === "en_cours") return "started";
  return "triage";
}

// --- L'ALLER : ce qu'on envoie a Linear --------------------------------------

/** Priorite Linear : 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low. */
const PRIORITE_PAR_SEVERITE: Record<SeveriteFeedback, number> = {
  bloquant: 1, // Urgent
  genant: 2, // High
  confort: 4, // Low
};

export function prioriteLinear(severite?: SeveriteFeedback): number {
  return severite ? PRIORITE_PAR_SEVERITE[severite] : 0;
}

/** Labels de l'equipe REAL31 (ils existent deja, cf. list_issue_labels du 2026-10-06). */
const LABEL_PAR_TYPE: Record<TypeFeedback, string> = { bug: "Bug", idee: "Idée" };

export function labelsLinear(type: TypeFeedback): string[] {
  return [LABEL_PAR_TYPE[type]];
}

/**
 * Une remontee doit-elle partir dans Linear ?
 *
 * TROIS garde-fous, et ils comptent au premier passage du cron (la table contient
 * deja des mois de remontees) :
 *
 *  1. SEVERITE PRESENTE. Une severite absente = entree « maison » creee par l'admin
 *     pour alimenter /nouveautes ou annoncer la roadmap (cf. `creerEntree`). Ce n'est
 *     pas une remontee de collaborateur : elle n'a rien a faire dans le backlog.
 *  2. STATUT NON TERMINAL. Creer aujourd'hui un ticket pour une remontee deja `livre`
 *     ou `ecarte` il y a trois mois ne remplirait le backlog que de bruit.
 *  3. NON ARCHIVEE. Archiver est le geste par lequel l'admin MASQUE une entree (de
 *     /nouveautes et de la worklist) sans la detruire : la pousser dans Linear la
 *     ferait reapparaitre par la fenetre. 6 des 67 remontees du premier passage
 *     etaient archivees, dont un artefact de test E2E - et elles etaient
 *     introuvables dans le panneau, justement parce qu'archivees (releve en
 *     cherchant l'entree de test avec Sekou, 2026-10-06).
 */
export function doitPartirDansLinear(f: Pick<Feedback, "severite" | "statut" | "archiveAt">): boolean {
  if (!f.severite) return false;
  if (estArchivee(f)) return false;
  return f.statut === "nouveau" || f.statut === "prevu" || f.statut === "en_cours";
}

/**
 * Corps du ticket Linear. On y remet le contexte que Linear n'a pas : qui a remonte,
 * depuis quelle application / quelle page, avec quelle gravite ressentie, et le lien
 * de retour vers le panneau admin.
 *
 * `baseUrl` absent (dev) -> le lien de retour est simplement omis.
 */
export function descriptionLinear(f: Feedback, baseUrl?: string): string {
  const { application, lien } = decoderPageFeedback(f.page);
  const lignes = [
    f.description.trim(),
    "",
    "---",
    `- **Application** : ${LIBELLES_APPLICATION[application]}${lien ? ` (\`${lien}\`)` : ""}`,
    `- **Gravité ressentie** : ${f.severite ?? "non renseignée"}`,
    `- **Remonté par** : ${f.auteurEmail ?? f.auteurInitiales ?? "inconnu"}`,
    `- **Le** : ${f.createdAt.slice(0, 10)}`,
  ];
  if (baseUrl) lignes.push(`- **Fiche interne** : ${baseUrl}/admin/feedback`);
  lignes.push("", "_Ticket créé automatiquement depuis le bouton « Un bug / une idée » de real31.app._");
  return lignes.join("\n");
}
