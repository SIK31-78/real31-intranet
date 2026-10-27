// Domaine de l'ecran "Mes emails" : cockpit de traitement des mails entrants.
// Flux par mail : reception -> rattachement copro / dossier -> reponse -> classement.
// Types metier purs (ADR-001). Plus d'analyse par modele depuis le 27/10/2026 (REA-423).

import type { TypeDossier } from "@/lib/domain/dossier";
import type { BoiteMail } from "@/lib/domain/boites-mail";
import { cleDeReference, referencesCitees } from "@/lib/domain/tri-emails";

/** Un dossier reel de la boite Outlook (selecteur de classement du cockpit). */
export interface DossierBoite {
  id: string;
  nom: string;
  /** 0 = dossier racine de la boite, 1 = sous-dossier de la boite de reception. */
  niveau: number;
}

// Dossiers systeme d'Outlook : on n'y « classe » pas un mail (supprimer, ce n'est pas ranger).
const DOSSIERS_SYSTEME = /^(éléments supprimés|deleted items|courrier indésirable|junk e-?mail|brouillons|drafts|éléments envoyés|sent items|boîte d'envoi|outbox|historique des conversations|conversation history|archive|flux rss|rss feeds|problèmes de synchronisation|sync issues)$/i;

/**
 * Le selecteur « Classer dans… » range les dossiers en deux groupes au lieu d'un tri
 * alphabetique melant les niveaux (retour de Sekou, 13/10) : d'abord les SOUS-DOSSIERS DE
 * LA RECEPTION (dossiers de binome, de travail), puis les autres dossiers racine. Les
 * dossiers systeme (supprimes, envoyes, indesirables…) sont retires. Tri francais.
 */
export function grouperDossiersBoite(dossiers: readonly DossierBoite[]): { reception: DossierBoite[]; autres: DossierBoite[] } {
  const tri = (a: DossierBoite, b: DossierBoite) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
  return {
    reception: dossiers.filter((d) => d.niveau > 0).sort(tri),
    autres: dossiers.filter((d) => d.niveau === 0 && !DOSSIERS_SYSTEME.test(d.nom.trim())).sort(tri),
  };
}

/** Taxonomie de tete de l'ancien tri par modele. Plus aucune analyse ne la remplit (REA-423) :
 *  les mails sortent en « autre », ce qui garde la suggestion de type de dossier neutre. */
export type TypeMail =
  | "panne_intervention"
  | "sinistre_degat_eaux"
  | "demande_copro_cs"
  | "devis_validation"
  | "facture_contrat_fournisseur"
  | "comptabilite"
  | "ag_cs"
  | "vefa_reserves"
  | "non_ticketable"
  | "autre";

/** Etat de traitement d'un mail par le gestionnaire (persiste, cloisonne). */
export type StatutTraitement = "nouveau" | "repondu" | "classe";

/** Rattachement du mail a un dossier existant ou nouveau. */
export interface Rattachement {
  statut: "existant" | "nouveau";
  dossierId: string;
  dossierLabel: string;
  /** true = dossier REEL du module Dossiers (intranet_dossiers) -> lien /dossiers/[id].
   *  false/absent = simple fil de conversation (legacy, non persiste comme dossier). */
  intranet?: boolean;
}

/** Type de dossier suggere a partir de la classification du mail (editable a la creation). */
export function typeDossierSuggere(type: TypeMail): TypeDossier {
  switch (type) {
    case "sinistre_degat_eaux":
      return "sinistre";
    case "panne_intervention":
    case "devis_validation":
    case "vefa_reserves":
      return "travaux";
    case "demande_copro_cs":
    case "ag_cs":
      return "question_diverse";
    default:
      return "autre";
  }
}

/** Piece jointe signifiante (les images de signature sont deja ecartees). */
export interface PieceJointe {
  nom: string;
}

/** Piece jointe REELLE (metadonnees Graph), chargee a la demande a l'ouverture du mail. */
export interface PieceJointeRef {
  id: string;
  nom: string;
  taille: number;
  type: string;
}

/** Une adresse d'en-tête, avec le nom affiché quand Outlook le connaît. */
export interface Correspondant {
  adresse: string;
  nom?: string;
}

/** « Nom <adresse> », ou l'adresse seule : la forme d'Outlook. */
export function libelleCorrespondant(c: Correspondant): string {
  const nom = (c.nom ?? "").trim();
  return nom && nom.toLowerCase() !== c.adresse.toLowerCase() ? `${nom} <${c.adresse}>` : c.adresse;
}

export type ReponseOutlook = "repondu" | "transfere";

/** Le dernier geste d'Outlook sur le mail (PidTagLastVerbExecuted) : 102/103 réponse, 104 transfert. */
export function reponseDepuisVerbe(verbe: number | undefined): ReponseOutlook | undefined {
  if (verbe === 102 || verbe === 103) return "repondu";
  if (verbe === 104) return "transfere";
  return undefined;
}

/** Un mail entrant en cours de traitement. */
export interface MailEntrant {
  id: string;
  /** Nom affiche de l'expediteur, ex "M. Bardet (copropriétaire)". */
  de: string;
  /** Adresse email de l'expediteur. */
  expediteurEmail: string;
  /** Destinataires (champ A). */
  destinataires: string[];
  /** Copie (champ Cc). */
  copie: string[];
  /** En-tête complet comme dans Outlook (noms + adresses) : À, Cc, Répondre à. */
  destinatairesDetail?: Correspondant[];
  copieDetail?: Correspondant[];
  repondreA?: Correspondant[];
  /** Ce qu'Outlook a fait de ce mail (réponse ou transfert, depuis Outlook ou l'intranet). */
  reponseOutlook?: ReponseOutlook;
  objet: string;
  /** Date ISO "YYYY-MM-DD" de reception (affichage). */
  date: string;
  /** Horodatage complet de reception (ISO). Sert au tri chronologique fidele a la
   *  vraie boite (ordre exact d'Outlook). Optionnel : repli sur `date` si absent. */
  recuLe?: string;
  /** Copropriete d'origine (la boite agrege plusieurs copros). */
  coproCode: string;
  coproNom: string;
  /** Adresse de la copro sur une ligne (modeles : « Immeuble concerné »), si connue. */
  coproAdresse?: string;
  /** Adresse de la boite QUI A RECU ce mail (cf. BoiteMail.id), en minuscules.
   *  Optionnel pour ne pas casser les fixtures anterieures au multi-boites : absent
   *  = boite personnelle du gestionnaire. Le service de lecture live le remplit
   *  TOUJOURS. Sert au filtrage du rail et au "De :" par defaut de la reponse. */
  boite?: string;
  /** Arrivé par une délégation de portefeuille : « Fanny S. », le titulaire pour qui l'on répond
   *  (badge « Pour Fanny S. », complément d'ADR-041 du 27/10/2026). Absent : un mail à moi. */
  pour?: string;
  /** Lu / non lu (feeling boite mail ; passe a true a l'ouverture). */
  lu: boolean;
  /** Corps du mail (deja nettoye : sans l'historique cite, qui se charge a la demande). */
  corps: string;
  attachments: PieceJointe[];
  /** Toujours « autre » depuis le retrait de l'analyse (REA-423) ; garde pour typeDossierSuggere. */
  type: TypeMail;
  rattachement: Rattachement;
  // --- Reponse en cours (editee, persistee) ---
  brouillonReponse?: string;
  // --- Etat de traitement persiste (rempli par le service, cloisonne par gestionnaire) ---
  statutTraitement?: StatutTraitement;
  /** Dossier Outlook ou le mail a ete classe (presélection + affichage apres reload). */
  dossierClasseId?: string;
  dossierClasseNom?: string;
}

/**
 * Contexte metier REEL d'une copropriete, source eStale (CS, AG, comptes...).
 * Enrichit le dossier d'un mail. Construit par le service depuis DonneesEstaleCopro
 * (port CondoEstaleProvider) ; `disponible=false` si la copro n'est pas sur eStale
 * ou si eStale est indisponible (degradation propre).
 */
export interface ContexteCopro {
  coproCode: string;
  disponible: boolean;
  conseilSyndical: { nomComplet: string; role: "president" | "membre" }[];
  derniereAg?: { date: string; type: "AG" | "AGE"; pvDispo?: boolean };
  budgetPrevisionnel?: number;
  depensesCourantes?: number;
  fondsTravaux?: number;
  nbProcedures?: number;
  nbDebiteurs?: number;
  contrats?: { libelle: string; categorie: string }[];
  anneeConstruction?: number;
}

export interface MesEmails {
  gestionnaire: { nomComplet: string; initiales: string };
  /** Boites visibles par le gestionnaire (perso + partagees). Jamais fusionnees :
   *  le rail en affiche une par une (decision Sekou 5, 2026-08-18). */
  boites: BoiteMail[];
  /** Nombre de mails bruts lus, toutes boites confondues. */
  nbMailsAnalyses: number;
  mails: MailEntrant[];
  /** La boîte perso a rempli son plafond : « Plus de mails » en charge davantage. */
  plusDeMails?: boolean;
  /** Adresses des boîtes qui n'ont pas pu être lues : l'écran le dit au-dessus de la liste. */
  boitesIllisibles?: string[];
  /** Copros du portefeuille du gestionnaire (rempli par le service ; rattachement manuel). */
  coprosDuGestionnaire?: { code: string; nom: string; adresse?: string }[];
}

// Tri CHRONOLOGIQUE (plus recent d'abord), comme une vraie boite mail. On NE trie plus
// par urgence : tant que l'IA/synchro ne sont pas fiables, l'ordre doit refleter la boite
// telle quelle pour qu'on verifie d'un coup d'oeil que le cockpit = Outlook. (decision
// Sekou 2026-06-26). Cle = horodatage complet `recuLe` (repli sur `date` au jour pres).
export function trierMails(mails: MailEntrant[]): MailEntrant[] {
  return [...mails].sort((a, b) => (b.recuLe ?? b.date).localeCompare(a.recuLe ?? a.date));
}

/** Les mails d'UNE boite. Un mail sans `boite` (fixture ancienne) est rattache a la
 *  boite personnelle : c'est le seul comportement qui ne fait disparaitre aucun mail. */
export function mailsDeLaBoite(
  mails: MailEntrant[],
  boiteId: string,
  boites: BoiteMail[],
): MailEntrant[] {
  const perso = boites.find((b) => b.personnelle)?.id;
  return mails.filter((m) => (m.boite ?? perso) === boiteId);
}

// --- La reponse a un mail : quatre regles metier, hors de l'ecran (audit 16/09/2026) -----

export type Destinataires = { to: string[]; cc: string[]; cci: string[] };

/** Sujet par defaut d'une reponse : prefixe « Re: » si l'objet n'en a pas deja un (Re, Ré, TR, Fwd). */
export function sujetDeReponse(m: Pick<MailEntrant, "objet"> & Partial<Pick<MailEntrant, "coproCode" | "coproNom">>): string {
  const objet = m.objet.trim();
  const dejaRe = PREFIXE_REPONSE.test(objet);
  // Mail travaillé pour le tri (13/10) : si le mail est rattaché à une copro et que son code
  // n'est pas déjà dans l'objet, la réponse le porte -> la réponse du client reviendra avec,
  // et le tri la reconnaîtra à coup sûr (« code dans l'objet »).
  const cle = m.coproCode ? cleDeReference(m.coproCode) : null;
  if (cle && !referencesCitees(objet).includes(cle)) {
    const tag = `${m.coproCode!.trim()}${m.coproNom?.trim() ? ` · ${m.coproNom.trim()}` : ""}`;
    return `Re: ${tag} - ${objet.replace(PREFIXE_REPONSE, "").trim()}`;
  }
  return dejaRe ? m.objet : `Re: ${m.objet}`;
}

const PREFIXE_REPONSE = /^(re|ré|tr|fwd?)\s*:\s*/i;

/** Destinataires par defaut : A = l'expediteur ; Cc = To + Cc d'origine dedupliques, sans l'expediteur ; Cci vide. */
export function destinatairesDeReponse(m: Pick<MailEntrant, "expediteurEmail" | "destinataires" | "copie">): Destinataires {
  const exp = (m.expediteurEmail || "").trim();
  const to = exp.includes("@") ? [exp] : [];
  const autres = [...m.destinataires, ...m.copie]
    .map((e) => e.trim())
    .filter((e) => e.includes("@") && e.toLowerCase() !== exp.toLowerCase());
  return { to, cc: [...new Set(autres)], cci: [] };
}

const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Le sous-dossier Outlook de la copro, pour archiver un mail conclu. Chacun a un dossier
 * par copro, nommé « S270 - nom » ou juste du nom : on reconnaît le CODE quelle que soit
 * son écriture (S270 = S0270, jamais S2700), sinon le nom (5 caractères au moins, sans
 * accents). "" = aucun.
 */
export function dossierOutlookSuggere(m: Pick<MailEntrant, "coproCode" | "coproNom">, dossiers: readonly DossierBoite[]): string {
  const cle = m.coproCode ? cleDeReference(m.coproCode) : null;
  const parCode = cle ? dossiers.find((d) => referencesCitees(d.nom).includes(cle)) : undefined;
  if (parCode) return parCode.id;
  const nom = sansAccents(m.coproNom);
  if (nom.length < 5) return "";
  return dossiers.find((d) => sansAccents(d.nom).includes(nom))?.id ?? "";
}

/** Le nom du sous-dossier à créer pour une copro : « S270 - Nom », la forme déjà en usage. */
export function nomDossierCopro(code: string, nom: string): string {
  const n = nom.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return (n ? `${code.trim()} - ${n}` : code.trim()).slice(0, 120);
}
