// Mails glisses a la main dans Outlook (ADR-046) : l'app relit les rangements recents et
// suit ce que l'equipe a fait. Remis dans la boite generique -> retour dans la file ;
// glisse dans un autre dossier connu -> etiquette corrigee (ou « copro a preciser »).
// Ecrit dans la boite (etiquettes) : ne tourne que si l'ecriture est ouverte. Appele par
// la tache planifiee SEULEMENT (/api/cron/tri-emails, toutes les 5 min). Jusqu'au 27/10/2026
// l'ecran le lancait aussi a chaque rendu (toutes les 60 s par onglet ouvert, jusqu'a 50
// appels Graph a chaque fois) : retire, la tache suffit.
//
// Avec la lecture incrementale (REA-419, 27/10/2026), la tache passe d'abord le delta de la
// reception (synchroniser-reception.ts) et le donne ici :
//   - un mail que le delta voit DANS la reception alors qu'il a un rangement reel actif,
//     anterieur au passage, a ete remis dans la generique : la ligne est annulee
//     (par « outlook ») sans le localiser dans Graph ;
//   - un mail que le delta vient de voir SORTIR de la reception a bien quitte la reception :
//     pas de relecture a ce passage.
// localiser ne sert plus qu'a voir un mail glisse d'un dossier de binome a un autre, sous le
// meme budget qu'avant. Sans delta (repli), tout passe par localiser comme avant.

import { PAR_OUTLOOK, constaterRangement, coproDuDossier } from "@/lib/domain/tri-emails";
import { etiqueterSansBloquer, type DepsRangement } from "./ranger";

const FENETRE_MS = 7 * 24 * 3600 * 1000;
/** Au plus tant de rangements relus par passage (un appel Graph chacun). */
const MAX_VERIFIES = 50;
const EN_PARALLELE = 4;
/** Un rangement plus recent que la lecture moins cette marge n'est pas juge par le delta. */
const MARGE_DELTA_MS = 60_000;
/**
 * Budget de temps, verifie avant chaque lot : le rangement automatique passe APRES dans les
 * 60 s du cron et doit garder les siennes (25 s). Un lot de 4 appels Graph qui trainent ne
 * doit pas manger tout le passage (27/10/2026).
 */
const BUDGET_MS = 15_000;

/** Ce que la lecture incrementale du passage a vu de la reception (synchroniserReception). */
export interface DeltaReconciliation {
  /** Debut de la lecture (ISO) : seul un rangement anterieur peut etre « remis en reception ». */
  debut: string;
  /** Mails vus dans la reception : internetMessageId -> id Graph. */
  presents: Map<string, string>;
  /** internetMessageId des mails vus sortir de la reception. */
  sortis: string[];
}

export interface BilanReconciliation {
  verifies: number;
  remisEnFile: number;
  deplaces: number;
  /** Rangements dont la relecture a echoue (Graph, journal) : retentes au passage suivant. */
  echecs: number;
}

/** Une boite a la fois (deps de cette boite) : la tache planifiee passe boite par boite. */
export async function reconcilierRangements(
  deps: DepsRangement,
  maintenant: () => number = Date.now,
  delta?: DeltaReconciliation,
): Promise<BilanReconciliation> {
  const bilan: BilanReconciliation = { verifies: 0, remisEnFile: 0, deplaces: 0, echecs: 0 };
  const boite = deps.boite;
  if (!boite || deps.simulation) return bilan;
  const debut = maintenant();

  const [journal, dossiers] = await Promise.all([
    deps.repo.journalDepuis(boite, new Date(Date.now() - FENETRE_MS).toISOString()),
    deps.repo.dossiers(boite),
  ]);
  const reels = journal.filter((e) => !e.simulation && e.dossierCle);

  // Remis dans la generique, d'apres le delta : pas d'appel Graph pour le savoir.
  const traites = new Set<string>();
  if (delta) {
    // Une minute de marge : un mail range juste avant la lecture peut encore y paraitre (Graph
    // n'est pas toujours a jour a la seconde) ; s'il est vraiment revenu, le passage suivant le voit.
    const avant = Date.parse(delta.debut) - MARGE_DELTA_MS;
    for (const e of reels) {
      const messageId = delta.presents.get(e.internetMessageId);
      if (!messageId || !(Date.parse(e.faitLe) < avant)) continue;
      traites.add(e.id);
      try {
        if (!(await deps.repo.marquerAnnule(e.id, PAR_OUTLOOK))) continue;
        if (e.copros.length) await etiqueterSansBloquer(deps, boite, messageId, { retirer: e.copros });
        bilan.remisEnFile++;
      } catch (err) {
        bilan.echecs++;
        console.error("[tri-emails] reconciliation (delta) :", err instanceof Error ? err.message : err);
      }
    }
  }
  const sortis = new Set(delta?.sortis ?? []);
  const aVerifier = reels.filter((e) => !traites.has(e.id) && !sortis.has(e.internetMessageId)).slice(0, MAX_VERIFIES);
  if (aVerifier.length === 0) return bilan;

  // Charge a la demande : seulement si un mail a change de dossier.
  let contexte: Promise<[Awaited<ReturnType<DepsRangement["referentiel"]["charger"]>>, Record<string, string>, Awaited<ReturnType<DepsRangement["repo"]["binomes"]>>]> | null = null;
  const charger = () => (contexte ??= Promise.all([deps.referentiel.charger(), deps.initialesParEmail(), deps.repo.binomes()]));

  for (let i = 0; i < aVerifier.length; i += EN_PARALLELE) {
    if (maintenant() - debut > BUDGET_MS) break;
    // allSettled : un appel Graph en echec sur un mail ne doit pas faire perdre le lot entier,
    // ni le reste du passage (27/10/2026).
    const resultats = await Promise.allSettled(
      aVerifier.slice(i, i + EN_PARALLELE).map(async (e) => {
        bilan.verifies++;
        const pos = await deps.rangement.localiser(boite, e.internetMessageId);
        const constat = constaterRangement(e.dossierCle!, pos, dossiers);
        if (constat.cas === "en-place" || constat.cas === "introuvable" || !pos) return;

        // Premier arrive, seul servi : deux passages, ou un passage et une annulation a
        // l'ecran, peuvent traiter le meme mail au meme instant.
        if (!(await deps.repo.marquerAnnule(e.id, PAR_OUTLOOK))) return;
        // A partir d'ici la ligne est annulee : ce qui suit ne doit plus bloquer. Une etiquette
        // qui echoue laissait le mail orphelin (annule, sans ligne « glisse dans Outlook »).
        if (e.copros.length) await etiqueterSansBloquer(deps, boite, pos.messageId, { retirer: e.copros });

        if (constat.cas === "remis-en-reception") {
          bilan.remisEnFile++;
          return;
        }
        // Glisse dans un autre dossier : on suit, et on deduit la copro si on peut.
        const [ref, initiales, binomes] = await charger();
        const copro = coproDuDossier(constat.vers.cle, ref.copros, initiales, binomes);
        if (copro) await etiqueterSansBloquer(deps, boite, pos.messageId, { ajouter: [copro] });
        await deps.repo.journaliser({
          boite,
          internetMessageId: e.internetMessageId,
          messageId: pos.messageId,
          expediteur: e.expediteur,
          objet: e.objet,
          coproReference: copro,
          copros: copro ? [copro] : [],
          dossierNom: constat.vers.nom,
          dossierCle: constat.vers.cle,
          signal: null,
          candidats: [],
          simulation: false,
          par: PAR_OUTLOOK,
        });
        bilan.deplaces++;
      }),
    );
    for (const r of resultats) {
      if (r.status === "rejected") {
        bilan.echecs++;
        console.error("[tri-emails] reconciliation :", r.reason instanceof Error ? r.reason.message : r.reason);
      }
    }
  }
  return bilan;
}
