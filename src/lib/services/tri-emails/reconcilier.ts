// Mails glisses a la main dans Outlook (ADR-046) : l'app relit les rangements recents et
// suit ce que l'equipe a fait. Remis dans la boite generique -> retour dans la file ;
// glisse dans un autre dossier connu -> etiquette corrigee (ou « copro a preciser »).
// Ecrit dans la boite (etiquettes) : ne tourne que si l'ecriture est ouverte. Appele par
// la tache planifiee SEULEMENT (/api/cron/tri-emails, toutes les 5 min). Jusqu'au 27/10/2026
// l'ecran le lancait aussi a chaque rendu (toutes les 60 s par onglet ouvert, jusqu'a 50
// appels Graph a chaque fois) : retire, la tache suffit.

import { PAR_OUTLOOK, constaterRangement, coproDuDossier } from "@/lib/domain/tri-emails";
import { etiqueterSansBloquer, type DepsRangement } from "./ranger";

const FENETRE_MS = 7 * 24 * 3600 * 1000;
/** Au plus tant de rangements relus par passage (un appel Graph chacun). */
const MAX_VERIFIES = 50;
const EN_PARALLELE = 4;
/**
 * Budget de temps, verifie avant chaque lot : le rangement automatique passe APRES dans les
 * 60 s du cron et doit garder les siennes (25 s). Un lot de 4 appels Graph qui trainent ne
 * doit pas manger tout le passage (27/10/2026).
 */
const BUDGET_MS = 15_000;

export interface BilanReconciliation {
  verifies: number;
  remisEnFile: number;
  deplaces: number;
  /** Rangements dont la relecture a echoue (Graph, journal) : retentes au passage suivant. */
  echecs: number;
}

/** Une boite a la fois (deps de cette boite) : la tache planifiee passe boite par boite. */
export async function reconcilierRangements(deps: DepsRangement, maintenant: () => number = Date.now): Promise<BilanReconciliation> {
  const bilan: BilanReconciliation = { verifies: 0, remisEnFile: 0, deplaces: 0, echecs: 0 };
  const boite = deps.boite;
  if (!boite || deps.simulation) return bilan;
  const debut = maintenant();

  const [journal, dossiers] = await Promise.all([
    deps.repo.journalDepuis(boite, new Date(Date.now() - FENETRE_MS).toISOString()),
    deps.repo.dossiers(boite),
  ]);
  const aVerifier = journal.filter((e) => !e.simulation && e.dossierCle).slice(0, MAX_VERIFIES);
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
