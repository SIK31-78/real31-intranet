// Service du tri des e-mails V2 (ADR-046) : la file a trier = la boite de reception de
// la boite generique, lue en direct. Pour chaque mail : la copro ESTALE proposee ; pour
// chaque copro : ou partirait le mail (dossier aux initiales du gestionnaire).
// Lecture : rien n'est deplace ici (le rangement vit dans ranger.ts). Les mails deja
// ranges (journal non annule) sont retires de la file, ce qui couvre aussi la simulation
// ou le mail n'a pas bouge.
// Plusieurs boites (V2 du 27/10/2026) : la file est celle d'UNE boite triee, passee par
// l'appelant (la boite de la personne, ou celle choisie par un super-admin), avec le
// referentiel de ses agences et sa date de mise en service.
// Index de la reception (REA-419, 27/10/2026) : la file n'est plus « les 100 plus recents »
// relus dans Graph a chaque affichage, mais TOUTE la reception depuis la mise en service, lue
// dans l'index local (synchroniser-reception.ts), les plus anciens en haut. Index absent
// (SQL pas passe) : l'ancienne lecture, et l'en-tete d'avant.

import {
  AUCUN_BINOME,
  avecMemeConversation,
  departagerParGestionnaire,
  destinationDe,
  dossiersChoisissables,
  estMailInterne,
  expediteursPublicite,
  lignesBinomes,
  motifCorbeille,
  type DossierChoisissable,
  suggererCopro,
  suggestionCorbeille,
  type CoproTri,
  type Destination,
  type EntreeJournalTri,
  type LigneBinome,
  type MailATrier,
  type ReferentielTri,
  type Suggestion,
} from "@/lib/domain/tri-emails";
import type { BoiteTriConfig } from "@/lib/domain/mail-gate";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { TriRepository } from "@/lib/ports/tri-repository";
import { getReferentielTriProvider, getTriRepository } from "@/lib/adapters/router";
import { compterMailsATrier } from "./compteur";
import { MAX_REPLI, lireReception, type LectureReception } from "./synchroniser-reception";
import { rangementSimule } from "./ranger";
import { listerCollaborateurs, listerGestionnairesCabinet, type Collaborateur } from "./binomes";

/** Longueur du texte affiche ; la suggestion lit un peu plus loin. */
const APERCU = 1500;
const TEXTE_ANALYSE = 4000;

export interface MailDeLaFile extends MailATrier {
  suggestion: Suggestion;
}

export interface CoproDeLaFile extends CoproTri {
  destination: Destination | null;
}

export interface FileATrier {
  /** Adresse lue, ou "echantillon". */
  boite: string;
  /** La reception depuis la mise en service, moins les mails deja ranges, les plus anciens en haut. */
  mails: MailDeLaFile[];
  /**
   * D'ou vient la file. "index" : toute la reception, d'apres l'index local ; "direct" : repli
   * tant que l'index n'existe pas, les MAX_REPLI plus recents lus dans Graph.
   */
  source: LectureReception["source"];
  /** Index : derniere lecture de la boite (ISO), null si inconnue. */
  synchroniseLe: string | null;
  /** Repli : la boite en contenait plus que les MAX_REPLI lus, la file n'est pas toute la reception. */
  tronquee: boolean;
  /** Repli : mails de la reception depuis la mise en service (compteur de la barre laterale), null si inconnu. */
  totalReception: number | null;
  copros: CoproDeLaFile[];
  /** Rangements des 7 derniers jours (revue de fin de semaine), les plus recents d'abord. */
  journal: EntreeJournalTri[];
  /** Un binome par gestionnaire de copros ESTALE (onglet « Binômes »). */
  binomes: LigneBinome[];
  /** Dossiers de binome qu'on peut viser a la main (« Ranger ailleurs »). */
  dossiers: DossierChoisissable[];
  /** Collaborateurs designables comme assistant. */
  collaborateurs: Collaborateur[];
  /** true = l'ecriture dans la boite est coupee : les rangements sont simules. */
  simulation: boolean;
  /** Message lisible si la boite ou ESTALE n'a pas repondu ; la page reste affichable. */
  erreur: string | null;
}

const SEPT_JOURS_MS = 7 * 24 * 3600 * 1000;
/** Fenetre du journal lue pour apprendre les publicites. */
const FENETRE_PUBLICITE_MS = 90 * 24 * 3600 * 1000;

/**
 * Les expediteurs de ces mails a proposer a la corbeille comme publicite (expediteursPublicite),
 * d'une lecture groupee du journal. Journal illisible : aucun (la file reste affichable, et
 * la tache planifiee, sans cette proposition, retombe sur ses autres garde-fous).
 */
export async function publicitesDeLaFile(repo: TriRepository, boite: string, mails: RawMail[], ref: ReferentielTri): Promise<Set<string>> {
  if (mails.length === 0) return new Set();
  try {
    const historique = await repo.historiqueExpediteurs(boite, mails.map((m) => m.from), new Date(Date.now() - FENETRE_PUBLICITE_MS).toISOString());
    return expediteursPublicite(historique, ref.expediteurs);
  } catch (e) {
    console.error("[tri-emails] publicités apprises du journal :", e instanceof Error ? e.message : e);
    return new Set();
  }
}


/**
 * Un mail brut de la boite, tel que la file l'affiche, avec sa suggestion. Partage par
 * l'ecran et le rangement automatique (ranger-auto.ts) : les deux voient la MEME piste.
 * Sans lecture des pieces jointes : la piste « pj » ne se calcule qu'a l'ecran, a la demande.
 * `coproConversation` : copro d'un mail de la meme conversation deja range (ou null).
 * `initialesParEmail` : pour le departage par le gestionnaire (reference « SC/4218461 »).
 */
export function mailDeLaFile(
  m: RawMail,
  boite: string,
  ref: ReferentielTri,
  coproConversation: string | null | undefined,
  /** Expediteurs appris comme publicite (publicitesDeLaFile). */
  publicites?: ReadonlySet<string>,
  initialesParEmail: Record<string, string> = {},
): MailDeLaFile {
  const texte = m.bodyText.replace(/\r\n/g, "\n").trim();
  // Non remis, reponse automatique, publicite apprise : la corbeille est proposee a la place
  // d'une copro. Un mail interne garde son propre motif (« Interne »).
  const interne = estMailInterne(m.from, boite);
  const corbeille = motifCorbeille({ deAdresse: m.from, objet: m.subject }, interne ? undefined : publicites);
  const base: MailATrier = {
    id: m.id,
    internetMessageId: m.internetMessageId,
    ...(m.conversationId ? { conversationId: m.conversationId } : {}),
    deNom: m.fromName ?? m.from,
    deAdresse: m.from,
    ...(m.to.length ? { a: m.to } : {}),
    ...(interne ? { interne: true } : {}),
    ...(corbeille ? { corbeille } : {}),
    objet: m.subject || "(sans objet)",
    recuLe: m.receivedAt,
    apercu: texte.slice(0, APERCU),
    aPiecesJointes: m.attachments.length > 0,
    ...(m.webLink ? { lienOutlook: m.webLink } : {}),
  };
  return {
    ...base,
    // Le corps entier sert a « Immeuble concerné », souvent loin dans l'historique cite.
    suggestion: corbeille
      ? suggestionCorbeille(corbeille)
      : avecMemeConversation(
          // Plusieurs candidates : celles du gestionnaire que l'echange designe d'abord (28/10/2026).
          departagerParGestionnaire(
            suggererCopro({ ...base, apercu: texte.slice(0, TEXTE_ANALYSE), corps: texte }, ref),
            `${base.objet}\n${texte}`,
            ref,
            initialesParEmail,
          ),
          coproConversation,
          ref,
        ),
  };
}

export async function lireFileATrier(config: BoiteTriConfig): Promise<FileATrier> {
  const boite = config.boite;

  // Le suivi des mails glisses a la main dans Outlook (reconcilier.ts) ne tourne plus ici
  // (27/10/2026) : il relancait jusqu'a 50 appels Graph a chaque rendu, soit toutes les 60 s
  // par onglet ouvert, alors que la tache planifiee le fait toutes les 5 min. Un mail remis
  // dans la generique reapparait donc dans la file au plus tard 5 min apres.
  const repo = getTriRepository();
  const [refRes, mailsRes, iniRes, binRes, journalRes, gestRes] = await Promise.allSettled([
    getReferentielTriProvider(config.agences).charger(),
    // L'index, relu dans Graph d'abord s'il a plus de 2 min (5 s au plus, jamais bloquant).
    lireReception(boite, { synchroniser: true }),
    listerCollaborateurs(),
    repo.binomes(),
    repo.journalDepuis(boite, new Date(Date.now() - SEPT_JOURS_MS).toISOString()),
    listerGestionnairesCabinet(),
  ]);

  const erreurs: string[] = [];
  if (refRes.status === "rejected") erreurs.push("Ni ESTALE ni le référentiel Crypto n'ont répondu : les suggestions sont indisponibles.");
  if (refRes.status === "fulfilled") erreurs.push(...(refRes.value.avertissements ?? []));
  if (mailsRes.status === "rejected") {
    // Cas attendu tant que la boite n'existe pas ou n'est pas dans l'Access Policy (403/404).
    erreurs.push(`La boîte ${boite} n'est pas lisible pour l'instant (boîte absente ou pas encore autorisée).`);
    console.error("[tri-emails] lecture de la boite :", mailsRes.reason instanceof Error ? mailsRes.reason.message : mailsRes.reason);
  }
  if (refRes.status === "rejected") {
    console.error("[tri-emails] referentiel :", refRes.reason instanceof Error ? refRes.reason.message : refRes.reason);
  }

  const ref = refRes.status === "fulfilled" ? refRes.value : { copros: [], expediteurs: {} };
  const collaborateurs = iniRes.status === "fulfilled" ? iniRes.value : [];
  const initiales: Record<string, string> = {};
  for (const c of collaborateurs) if (c.initiales) initiales[c.email] = c.initiales;
  const binomes = binRes.status === "fulfilled" ? binRes.value : AUCUN_BINOME;
  const gestionnaires = gestRes.status === "fulfilled" ? gestRes.value : [];
  const journal = journalRes.status === "fulfilled" ? journalRes.value : [];
  if (journalRes.status === "rejected") erreurs.push("Le journal du tri est indisponible.");
  const lecture = mailsRes.status === "fulfilled" ? mailsRes.value : null;
  if (lecture?.avertissement) erreurs.push(lecture.avertissement);
  // Du plus ancien au plus recent : on traite la file dans l'ordre d'arrivee (decision Sekou
  // du 27/10/2026), le plus ancien est celui qui attend depuis le plus longtemps.
  const tous = lecture?.mails ?? [];
  // En reel, une ligne simulee (session de dev sur la meme base) ne cache pas le mail : il
  // n'a jamais bouge, il est bien dans la boite (27/10/2026). En simulation, elle le retire
  // de la file comme avant.
  const ranges = await repo
    .dejaRanges(boite, tous.map((m) => m.internetMessageId), { reellesSeulement: !rangementSimule(config) })
    .catch(() => new Set<string>());
  const bruts = tous.filter((m) => !ranges.has(m.internetMessageId));
  // Historique du tri, MEME CONVERSATION seulement : la copro ou un mail du fil a deja ete
  // range. Journal sans la colonne (SQL pas encore passe) ou illisible : sans historique.
  const conversations = await repo
    .coprosDesConversations(boite, bruts.map((m) => m.conversationId).filter((c): c is string => Boolean(c)))
    .catch((e: unknown) => {
      console.error("[tri-emails] historique des conversations :", e instanceof Error ? e.message : e);
      return new Map<string, string>();
    });

  // Repli seulement : la lecture directe est bornee a MAX_REPLI ; quand la boite en contient
  // plus, l'en-tete le dit avec le vrai total (compteur de la pastille, en cache 60 s).
  const tronquee = lecture?.source === "direct" && tous.length >= MAX_REPLI;
  const totalReception = tronquee ? await compterMailsATrier(boite) : null;

  const publicites = await publicitesDeLaFile(repo, boite, bruts, ref);
  const mails: MailDeLaFile[] = bruts.map((m) =>
    mailDeLaFile(m, boite, ref, m.conversationId ? conversations.get(m.conversationId) : null, publicites, initiales),
  );

  // L'onglet « Binômes » ne liste que les copros actives : une copro inactive reste
  // proposable dans la file, mais on ne l'affecte plus a un assistant.
  const lignes = lignesBinomes(gestionnaires, ref.copros.filter((c) => !c.inactive), binomes, initiales);
  const copros: CoproDeLaFile[] = ref.copros.map((c) => ({ ...c, destination: destinationDe(c, initiales, binomes) }));

  return {
    boite,
    mails,
    source: lecture?.source ?? "index",
    synchroniseLe: lecture?.majLe ?? null,
    tronquee,
    totalReception,
    copros,
    journal,
    binomes: lignes,
    dossiers: dossiersChoisissables(lignes),
    collaborateurs,
    simulation: rangementSimule(config),
    erreur: erreurs.length ? erreurs.join(" ") : null,
  };
}
