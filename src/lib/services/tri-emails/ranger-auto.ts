// Rangement AUTOMATIQUE des mails d'une boite triee (decision Sekou du 20/10/2026, ADR-046 : « un clic
// d'abord, puis de l'automatique signal par signal ») : piste « sure », et depuis le 26/10 piste
// « faible » par le nom de l'immeuble ou son adresse (pisteRangeable). Appele par la tache
// planifiee (/api/cron/tri-emails, toutes les 5 min), APRES la reconciliation.
//
// Puis, depuis le 26/10/2026, la lecture des PDF : pour les mails restes sans piste rangeable
// (aLirePiecesJointes), quelques-uns par passage, ranges seuls quand leurs PDF ne designent
// qu'UNE copro (rangeableParPiecesJointes), journal « pj ».
//
// Depuis le 28/10/2026, plusieurs candidates (du mail ou des PDF) qui menent toutes au meme
// dossier de binome : le mail y est range, etiquete de chacune (cible « dossier »).
//
// Meme geste qu'un clic : rangerMail (dossier du binome, etiquette, journal), avec
// par = « automatique ». Annulable d'un clic comme un rangement manuel ; un mail annule une
// fois n'est plus jamais range tout seul (rangeableAutomatiquement : « deja-passe »).
//
// Interrupteurs : MAIL_TRI_AUTO=on (coupe par defaut) ET `automatique` dans la config de la
// boite (MAIL_TRI_BOITES ; jusqu'au 27/10/2026, une constante syndic4 en dur) ; ecriture
// coupee (MAIL_TRI_ECRITURE ou `ecriture` de la boite) = rangements simules et journalises
// comme tels, comme un clic. Une boite a la fois : la tache planifiee passe boite par boite.
//
// Lecture (REA-419, 27/10/2026) : toute la reception depuis la mise en service, d'apres
// l'index local que la tache vient de mettre a jour (synchroniser-reception.ts), et plus les
// 100 plus recents : un retard d'un jour ne laisse plus les plus anciens de cote. Index absent
// (SQL pas passe) : la lecture directe d'avant.

import {
  PAR_AUTOMATIQUE,
  aLirePiecesJointes,
  rangeableAutomatiquement,
  rangeableParPiecesJointes,
  signalDuRangement,
  type BinomesTri,
  type CibleTri,
  type CoproTri,
  type DecisionAutomatique,
  type RefusAutomatique,
  type SignalTri,
} from "@/lib/domain/tri-emails";
import { boiteTri, triAutomatiquePour } from "@/lib/domain/mail-gate";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import type { TriRepository } from "@/lib/ports/tri-repository";
import { signalerException } from "@/lib/observabilite";
import { coprosDeTousLesPdf } from "./copro-pieces-jointes";
import { mailDeLaFile, publicitesDeLaFile, type MailDeLaFile } from "./lire-file";
import { rangerMail, type DepsRangement } from "./ranger";
import { lireReception } from "./synchroniser-reception";

/** Au plus tant de rangements par passage : quelques appels Graph chacun, un par un. */
const MAX_RANGES = 30;
/** Budget de temps des rangements, dans les 60 s du cron (la reconciliation passe avant). */
const BUDGET_MS = 25_000;
/** Au plus tant de mails dont on lit les PDF par passage (5 PDF au plus chacun). */
const MAX_PJ = 8;
/**
 * Delai laisse a la lecture des PDF d'un mail. Une lecture ne commence que s'il reste ce delai
 * plus MARGE_RANGEMENT_MS dans le budget : le passage reste sous BUDGET_MS.
 */
const DELAI_PJ_MS = 8_000;
const MARGE_RANGEMENT_MS = 3_000;

/**
 * Mails dont les PDF ont deja ete lus sans permettre de ranger (aucune copro, plusieurs,
 * contradiction, delai depasse) : on ne les retelecharge pas a chaque passage. Memoire de
 * l'instance seulement (une instance Vercel tiede sert plusieurs passages ; une instance
 * neuve relit) : pas de table pour ca. Bornee, et oubliee au bout d'un jour (le referentiel
 * peut avoir change). Cle « boite|internetMessageId » : la meme instance sert plusieurs boites.
 */
const PJ_SANS_SUITE = new Map<string, number>();
const PJ_MEMOIRE_MAX = 1_000;
const PJ_MEMOIRE_MS = 24 * 3600 * 1000;

function dejaLuSansSuite(memoire: Map<string, number>, id: string, t: number): boolean {
  const vu = memoire.get(id);
  if (vu === undefined) return false;
  if (t - vu < PJ_MEMOIRE_MS) return true;
  memoire.delete(id);
  return false;
}

function retenirSansSuite(memoire: Map<string, number>, id: string, t: number): void {
  // Une Map garde l'ordre d'insertion : la plus ancienne entree part la premiere.
  const plusAncienne = memoire.keys().next();
  if (memoire.size >= PJ_MEMOIRE_MAX && !plusAncienne.done) memoire.delete(plusAncienne.value);
  memoire.set(id, t);
}

/**
 * Le depot du passage, avec les binomes lus UNE fois : rangerMail les relit a chaque mail
 * sinon (resoudreDossier). Un Proxy et pas `{ ...repo, binomes }` : l'adaptateur Supabase est
 * une classe, ses methodes sont sur le prototype et un spread les perdrait (27/10/2026).
 */
function avecBinomesFiges(repo: TriRepository, binomes: BinomesTri): TriRepository {
  return new Proxy(repo, {
    get(cible, prop, recepteur) {
      if (prop === "binomes") return async () => binomes;
      const v = Reflect.get(cible, prop, recepteur) as unknown;
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(cible) : v;
    },
  });
}

class DelaiDepasse extends Error {}

function avecDelai<T>(p: Promise<T>, ms: number): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<never>((_, rejeter) => {
    minuteur = setTimeout(() => rejeter(new DelaiDepasse(`lecture des PDF au-delà de ${ms} ms`)), ms);
  });
  return Promise.race([p, delai]).finally(() => clearTimeout(minuteur));
}

/** Ou ranger le mail d'apres la decision : une copro, ou le dossier commun a plusieurs. */
function cibleDe(decision: DecisionAutomatique): CibleTri | null {
  if (!decision.ok) return null;
  if ("dossier" in decision) return { type: "dossier", cle: decision.dossier.cle, copros: decision.dossier.copros };
  return { type: "copro", reference: decision.reference };
}

export interface OptionsAutomatique {
  /** Defaut : MAIL_TRI_AUTO=on ET `automatique` dans la config de la boite. */
  actif?: boolean;
  max?: number;
  budgetMs?: number;
  maintenant?: () => number;
  /** Defaut : la reception d'apres l'index, depuis la mise en service du tri de la boite (`depuis`). */
  lireMails?: (boite: string) => Promise<RawMail[]>;
  /** Defaut : coprosDeTousLesPdf (Graph + pdfjs). Rend l'union des copros de tous les PDF. */
  lirePdf?: (internetMessageId: string, copros: CoproTri[]) => Promise<string[]>;
  /** Defaut : MAX_PJ. 0 = pas de lecture des PDF. */
  maxPj?: number;
  delaiPjMs?: number;
  /** Defaut : la memoire de l'instance (PJ_SANS_SUITE). */
  memoirePj?: Map<string, number>;
}

export interface BilanAutomatique {
  actif: boolean;
  /** Mails de la boite de reception examines (deja passes par le tri compris). */
  examines: number;
  ranges: number;
  /** Rangeables, mais le rangement a echoue (retente au passage suivant). */
  echecs: number;
  /** Rangeables, laisses pour le passage suivant (plafond ou budget de temps atteint). */
  reportes: number;
  refus: Partial<Record<RefusAutomatique, number>>;
  /** Lecture des PDF des mails restes sans piste rangeable. */
  pj: {
    /** Mails dont les PDF ont ete lus a ce passage. */
    lus: number;
    /** Ranges sur la foi de leurs PDF (compris dans `ranges`). */
    ranges: number;
    /** Deja lus sans suite a un passage precedent : pas relus. */
    dejaLus: number;
    /** A lire, laisses pour le passage suivant (plafond ou budget de temps). */
    reportes: number;
    /** Lecture en erreur ou au-dela du delai. */
    erreurs: number;
    refus: Partial<Record<RefusAutomatique, number>>;
  };
}

// Sans relire Graph : la tache planifiee vient de mettre l'index a jour.
const lireParDefaut = async (boite: string): Promise<RawMail[]> => (await lireReception(boite)).mails;

export async function rangerAutomatiquement(
  deps: DepsRangement,
  opts: OptionsAutomatique = {},
): Promise<BilanAutomatique> {
  const bilan: BilanAutomatique = {
    actif: opts.actif ?? triAutomatiquePour(boiteTri(deps.boite)),
    examines: 0,
    ranges: 0,
    echecs: 0,
    reportes: 0,
    refus: {},
    pj: { lus: 0, ranges: 0, dejaLus: 0, reportes: 0, erreurs: 0, refus: {} },
  };
  const boite = deps.boite;
  // Automatique coupe pour la boite : rangeableAutomatiquement le refuserait mail par mail,
  // inutile de lire.
  if (!bilan.actif || !boite) return bilan;

  const maintenant = opts.maintenant ?? Date.now;
  const debut = maintenant();
  const lus = await (opts.lireMails ?? lireParDefaut)(boite);
  if (lus.length === 0) return bilan;

  // Un seul chargement du referentiel et des initiales pour tout le passage (rangerMail les
  // relit a chaque mail sinon).
  const referentiel = deps.referentiel.charger();
  const initiales = deps.initialesParEmail();
  // L'historique de la conversation, comme a l'ecran : une piste faible par le nom ou
  // l'adresse que le fil contredit (rangé dans une autre copro) y devient « plusieurs ».
  const conversations = deps.repo
    .coprosDesConversations(boite, lus.map((m) => m.conversationId).filter((c): c is string => Boolean(c)))
    .catch((e: unknown) => {
      console.error("[tri-emails:auto] historique des conversations :", e instanceof Error ? e.message : e);
      signalerException(e, { source: "cron-tri-emails", detail: { etape: "conversations" } });
      return new Map<string, string>();
    });
  const [ref, initialesParEmail, binomes, dejaPasses, coprosConversations] = await Promise.all([
    referentiel,
    initiales,
    deps.repo.binomes(),
    // En reel, une ligne simulee (dev local sur la meme base) n'est pas un passage par le
    // tri : le mail n'a jamais bouge, l'automatique le range (27/10/2026).
    deps.repo.dejaJournalises(boite, lus.map((m) => m.internetMessageId), { reellesSeulement: !deps.simulation }),
    conversations,
  ]);
  // Les publicites apprises du journal : corbeille proposee, donc jamais rangees seules.
  const publicites = await publicitesDeLaFile(deps.repo, boite, lus, ref);
  const depsPassage: DepsRangement = {
    ...deps,
    referentiel: { charger: () => referentiel },
    initialesParEmail: () => initiales,
    repo: avecBinomesFiges(deps.repo, binomes),
  };

  // Les plus anciens d'abord : un report ne retarde que les derniers arrives.
  const aRanger: { m: RawMail; cible: CibleTri; signal: { nature: SignalTri; candidats: string[] } }[] = [];
  const aLirePj: { m: RawMail; mail: MailDeLaFile }[] = [];
  // On est passe au-dela du coupe-circuit : l'automatique est ouvert pour cette boite.
  const ctx = { automatique: true, dejaPasse: false, copros: ref.copros, initialesParEmail, binomes };
  for (const m of [...lus].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    bilan.examines++;
    const mail = mailDeLaFile(m, boite, ref, m.conversationId ? coprosConversations.get(m.conversationId) : null, publicites);
    const dejaPasse = dejaPasses.has(m.internetMessageId);
    const decision = rangeableAutomatiquement(mail, { ...ctx, dejaPasse });
    // Le journal garde le signal reel (« sure » ou « faible ») : c'est lui que la revue mesure.
    const cible = cibleDe(decision);
    if (cible) aRanger.push({ m, cible, signal: signalDuRangement(mail.suggestion, null) });
    else if (!decision.ok) bilan.refus[decision.motif] = (bilan.refus[decision.motif] ?? 0) + 1;
    if (aLirePiecesJointes(mail, decision, dejaPasse)) aLirePj.push({ m, mail });
  }

  const max = opts.max ?? MAX_RANGES;
  const budget = opts.budgetMs ?? BUDGET_MS;
  const ranger = async (m: RawMail, cible: CibleTri, signal: { nature: SignalTri; candidats: string[] }): Promise<boolean> => {
    try {
      await rangerMail(
        {
          messageId: m.id,
          internetMessageId: m.internetMessageId,
          expediteur: m.from,
          objet: m.subject || "(sans objet)",
          cible,
          suggestion: signal,
        },
        PAR_AUTOMATIQUE,
        depsPassage,
      );
      bilan.ranges++;
      return true;
    } catch (e) {
      // Range entre-temps a la main, copro sortie d'ESTALE... : le mail reste dans la file.
      bilan.echecs++;
      console.error(`[tri-emails:auto] ${m.internetMessageId} : ${e instanceof Error ? e.message : String(e)}`);
      signalerException(e, { source: "cron-tri-emails", detail: { etape: "rangement", cible: JSON.stringify(cible) } });
      return false;
    }
  };

  // Un par un : deux mails vers un dossier pas encore cree le creeraient deux fois.
  for (const { m, cible, signal } of aRanger) {
    if (bilan.ranges + bilan.echecs >= max || maintenant() - debut > budget) {
      bilan.reportes++;
      continue;
    }
    await ranger(m, cible, signal);
  }

  // Les PDF ensuite : un telechargement par piece, les pistes du mail passent d'abord. Une
  // lecture ne commence que si elle peut finir, rangement compris, dans le budget.
  const maxPj = opts.maxPj ?? MAX_PJ;
  const delaiPj = opts.delaiPjMs ?? DELAI_PJ_MS;
  const memoire = opts.memoirePj ?? PJ_SANS_SUITE;
  const lirePdf = opts.lirePdf ?? ((id: string, copros: CoproTri[]) => coprosDeTousLesPdf(boite, id, copros));
  for (const { m, mail } of aLirePj) {
    const id = m.internetMessageId;
    const cleMemoire = `${boite}|${id}`;
    if (dejaLuSansSuite(memoire, cleMemoire, maintenant())) {
      bilan.pj.dejaLus++;
      continue;
    }
    const plusDeTemps = maintenant() - debut + delaiPj + MARGE_RANGEMENT_MS > budget;
    if (bilan.pj.lus >= maxPj || bilan.ranges + bilan.echecs >= max || plusDeTemps) {
      bilan.pj.reportes++;
      continue;
    }
    bilan.pj.lus++;
    let pdf: string[];
    try {
      pdf = await avecDelai(lirePdf(id, ref.copros), delaiPj);
    } catch (e) {
      bilan.pj.erreurs++;
      // Au-dela du delai, la relire au passage suivant prendrait encore le meme temps.
      if (e instanceof DelaiDepasse) retenirSansSuite(memoire, cleMemoire, maintenant());
      console.error(`[tri-emails:auto] PDF de ${id} : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const decision = rangeableParPiecesJointes(mail, pdf, ctx);
    const cible = cibleDe(decision);
    if (!cible) {
      if (!decision.ok) bilan.pj.refus[decision.motif] = (bilan.pj.refus[decision.motif] ?? 0) + 1;
      retenirSansSuite(memoire, cleMemoire, maintenant());
      continue;
    }
    const candidats = cible.type === "copro" ? [cible.reference] : cible.type === "dossier" ? cible.copros : [];
    if (await ranger(m, cible, { nature: "pj", candidats })) bilan.pj.ranges++;
  }
  return bilan;
}
