// Index local de la boite de reception d'une boite triee (REA-419, decision Sekou du
// 27/10/2026 : lecture incrementale tout de suite, pas de borne a 300). Avant, la file et
// l'automatique relisaient les 100 mails les plus recents, corps compris, a chaque affichage
// et toutes les 5 min : a 130 mails par jour sur syndic2, un jour de retard rendait les plus
// anciens invisibles et jamais ranges, et la pastille comptait 99+ sans que l'ecran les montre.
//
// Maintenant : synchroniserReception lit dans Graph ce qui a change depuis le passage
// precedent (requete delta) et l'applique a l'index ; la file, l'automatique et la pastille
// lisent l'index. Appele par la tache planifiee de chaque boite AVANT la reconciliation et
// l'automatique (budget 20 s), et a l'ouverture de /tri-emails si l'index date de plus de
// 2 min (budget 5 s, jamais bloquant). L'app marque elle-meme ce qu'elle range (ranger.ts).
//
// Repli : tant que supabase/sql/intranet_mail_reception.sql n'est pas passe (la prod tourne
// avant), l'index leve IndexReceptionAbsent et on relit la boite comme avant (lireRecents,
// les 100 plus recents), signale une fois par instance.

import { debutTri } from "@/lib/domain/mail-gate";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { IndexReceptionAbsent, type EtatDelta, type ReceptionIndex } from "@/lib/ports/reception-index";
import type { ReceptionDeltaProvider } from "@/lib/ports/reception-delta";
import { getIngestionTri, getReceptionDelta, getReceptionIndex } from "@/lib/adapters/router";
import { signalerException } from "@/lib/observabilite";

/** Budget de la lecture incrementale dans la tache planifiee (60 s en tout). */
export const BUDGET_SYNCHRO_CRON_MS = 20_000;
/** Budget a l'ouverture de l'ecran : au-dela, on affiche l'index tel quel. */
export const BUDGET_SYNCHRO_ECRAN_MS = 5_000;
/** L'ecran ne relance pas la lecture si l'index a ete mis a jour depuis moins que ca. */
export const FRAICHEUR_ECRAN_MS = 2 * 60_000;
/** Les mails sortis de la reception sont oublies au bout de ce delai (purge de la tache). */
export const CONSERVATION_SORTIS_MS = 30 * 24 * 3600 * 1000;
/** Repli sans index : la lecture d'avant, les plus recents seulement. */
export const MAX_REPLI = 100;

export interface BilanSynchro {
  /** false = l'index n'existe pas (SQL pas passe) : rien n'a ete lu. */
  indexDisponible: boolean;
  ajoutes: number;
  retires: number;
  pages: number;
  /** true = la lecture est allee jusqu'au bout ; false = budget atteint, la suite au prochain passage. */
  complet: boolean;
  /** Relecture complete terminee : mails de l'index que Graph n'a pas revus, sortis. */
  nonRevus: number;
  erreur?: string;
  /** Debut du passage (ISO) : un mail « revenu » ne compte que pour un rangement anterieur. */
  debut: string;
  /** Mails presents dans la reception d'apres ce passage : internetMessageId -> id Graph. */
  presents: Map<string, string>;
  /** internetMessageId des mails que ce passage a vus sortir de la reception. */
  sortis: string[];
}

export interface OptionsSynchro {
  budgetMs: number;
  index?: ReceptionIndex;
  delta?: ReceptionDeltaProvider;
  maintenant?: () => number;
  /** Defaut : la mise en service du tri de la boite (debutTri). */
  depuis?: string | null;
}

let absenceSignalee = false;

/** Index absent : un journal et un signalement Sentry par instance, pas un par appel. */
function signalerAbsence(e: IndexReceptionAbsent): void {
  if (absenceSignalee) return;
  absenceSignalee = true;
  console.warn(`[tri-emails] ${e.message} Lecture directe de la boîte en attendant.`);
  signalerException(e, { source: "supabase", detail: { etape: "index-reception" } });
}

const messageDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function synchroniserReception(boite: string, opts: OptionsSynchro): Promise<BilanSynchro> {
  const index = opts.index ?? getReceptionIndex();
  const maintenant = opts.maintenant ?? Date.now;
  const debut = new Date(maintenant()).toISOString();
  const bilan: BilanSynchro = { indexDisponible: true, ajoutes: 0, retires: 0, pages: 0, complet: false, nonRevus: 0, debut, presents: new Map(), sortis: [] };

  let etat: EtatDelta | null;
  try {
    etat = await index.jetonDelta(boite);
  } catch (e) {
    if (e instanceof IndexReceptionAbsent) {
      signalerAbsence(e);
      return { ...bilan, indexDisponible: false };
    }
    throw e;
  }

  const depuis = opts.depuis === undefined ? debutTri(boite) : opts.depuis;
  let lu;
  try {
    lu = await (opts.delta ?? getReceptionDelta(boite)).lireDelta(boite, {
      jeton: etat?.jeton ?? null,
      ...(depuis ? { depuis } : {}),
      budgetMs: opts.budgetMs,
      maintenant,
    });
  } catch (e) {
    // Graph en panne : on garde le jeton (la lecture reprendra au meme point) et on le note.
    bilan.erreur = messageDe(e);
    await index.enregistrerJetonDelta(boite, { jeton: etat?.jeton ?? null, erreur: bilan.erreur, resynchroLe: etat?.resynchroLe ?? null });
    return bilan;
  }

  // Le filtre de Graph sur la date suffit d'ordinaire ; on le refait ici au cas ou.
  const seuil = depuis ? Date.parse(depuis) : Number.NaN;
  const ajoutes = Number.isNaN(seuil) ? lu.ajoutes : lu.ajoutes.filter((m) => !(Date.parse(m.receivedAt) < seuil));
  const { sortis } = await index.appliquer(boite, { ajoutes, retires: lu.retires });

  // Relecture complete (premier passage, ou jeton expire) : elle peut s'etaler sur plusieurs
  // passages ; on retient quand elle a commence. A sa fin, ce qu'elle n'a pas revu est sorti.
  let resynchroLe = etat?.jeton && !lu.reinitialise ? etat.resynchroLe : debut;
  if (lu.complet && resynchroLe) {
    bilan.nonRevus = await index.sortirNonRevus(boite, resynchroLe);
    resynchroLe = null;
  }
  await index.enregistrerJetonDelta(boite, { jeton: lu.jeton, erreur: null, resynchroLe });

  bilan.ajoutes = ajoutes.length;
  bilan.retires = lu.retires.length;
  bilan.pages = lu.pages;
  bilan.complet = lu.complet;
  bilan.presents = new Map(ajoutes.map((m) => [m.internetMessageId, m.id]));
  bilan.sortis = sortis;
  return bilan;
}

/** Oublie les mails sortis de la reception depuis plus de 30 jours (tache planifiee). */
export async function purgerSortis(boite: string, index: ReceptionIndex = getReceptionIndex(), maintenant: () => number = Date.now): Promise<number> {
  return index.purger(boite, new Date(maintenant() - CONSERVATION_SORTIS_MS).toISOString());
}

/** Ce que l'ecran et l'automatique lisent de la reception. */
export interface LectureReception {
  /** Du plus ancien au plus recent. */
  mails: RawMail[];
  /** "index" : toute la reception, d'apres l'index ; "direct" : repli, les MAX_REPLI plus recents lus dans Graph. */
  source: "index" | "direct";
  /** Index : la derniere lecture incrementale (ISO), null si elle n'a jamais tourne. */
  majLe: string | null;
  /** Index : la derniere lecture incrementale a echoue (message), ou n'est pas allee au bout. */
  avertissement: string | null;
}

const plusAnciensDabord = (mails: RawMail[]) => [...mails].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));

/** Repli sans index : la lecture d'avant le 27/10/2026. */
async function lireEnDirect(boite: string, depuis: string | null): Promise<LectureReception> {
  const mails = await getIngestionTri(boite).lireRecents({ email: boite, max: MAX_REPLI, ...(depuis ? { depuis } : {}) });
  return { mails: plusAnciensDabord(mails), source: "direct", majLe: null, avertissement: null };
}

/**
 * Les mails de la boite de reception, du plus ancien au plus recent, depuis la mise en service
 * du tri. `synchroniser` (l'ecran) : relance d'abord la lecture incrementale si l'index a plus
 * de 2 min, avec un budget de 5 s ; une erreur devient un avertissement, on lit l'index tel quel.
 */
export async function lireReception(
  boite: string,
  opts: { synchroniser?: boolean; index?: ReceptionIndex; maintenant?: () => number } = {},
): Promise<LectureReception> {
  const index = opts.index ?? getReceptionIndex();
  const maintenant = opts.maintenant ?? Date.now;
  const depuis = debutTri(boite);
  let etat: EtatDelta | null;
  try {
    etat = await index.jetonDelta(boite);
  } catch (e) {
    if (!(e instanceof IndexReceptionAbsent)) throw e;
    signalerAbsence(e);
    return lireEnDirect(boite, depuis);
  }

  let avertissement: string | null = null;
  const perime = !etat || maintenant() - Date.parse(etat.majLe) > FRAICHEUR_ECRAN_MS;
  if (opts.synchroniser && perime) {
    try {
      const b = await synchroniserReception(boite, { budgetMs: BUDGET_SYNCHRO_ECRAN_MS, index, maintenant });
      if (b.erreur) avertissement = "La boîte n'a pas répondu : la file est celle de la dernière lecture.";
      else if (!b.complet) avertissement = "Lecture de la boîte en cours : la file se complète au prochain rafraîchissement.";
      etat = (await index.jetonDelta(boite)) ?? etat;
    } catch (e) {
      console.error("[tri-emails] lecture incrémentale à l'ouverture :", messageDe(e));
      avertissement = "La boîte n'a pas pu être relue : la file est celle de la dernière lecture.";
    }
  } else if (etat?.erreur) {
    avertissement = "La dernière lecture de la boîte a échoué : la file peut avoir quelques minutes de retard.";
  } else if (etat && (etat.resynchroLe || !etat.jeton)) {
    avertissement = "Lecture de la boîte en cours : la file se complète au prochain rafraîchissement.";
  }

  const mails = await index.enReception(boite, depuis ? { depuis } : {});
  return { mails, source: "index", majLe: etat?.majLe ?? null, avertissement };
}

/** Le nombre de mails de la reception d'apres l'index ; null si l'index n'existe pas (repli). */
export async function compterDansLIndex(boite: string, index: ReceptionIndex = getReceptionIndex()): Promise<number | null> {
  const depuis = debutTri(boite);
  try {
    return await index.compter(boite, depuis ? { depuis } : {});
  } catch (e) {
    if (!(e instanceof IndexReceptionAbsent)) throw e;
    signalerAbsence(e);
    return null;
  }
}

/**
 * L'app vient de sortir ces mails de la reception (rangement, suppression) : l'index le sait
 * tout de suite, sans attendre le delta suivant. Ne fait jamais echouer le geste.
 */
export async function marquerSortis(index: ReceptionIndex | undefined, boite: string, internetMessageIds: string[]): Promise<void> {
  if (!index || internetMessageIds.length === 0) return;
  try {
    await index.sortir(boite, internetMessageIds);
  } catch (e) {
    if (!(e instanceof IndexReceptionAbsent)) console.error("[tri-emails] index de la réception (sortie) :", messageDe(e));
  }
}

/** Une annulation a remis le mail dans la reception : il revient dans la file tout de suite. */
export async function marquerRemis(index: ReceptionIndex | undefined, boite: string, internetMessageId: string, messageId?: string): Promise<void> {
  if (!index) return;
  try {
    await index.remettre(boite, internetMessageId, messageId);
  } catch (e) {
    if (!(e instanceof IndexReceptionAbsent)) console.error("[tri-emails] index de la réception (remise) :", messageDe(e));
  }
}
