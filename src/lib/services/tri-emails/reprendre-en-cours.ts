// Reprise des rangements interrompus (REA-420, 27/10/2026, journal transactionnel). Un
// rangement ecrit sa ligne « en_cours » AVANT de deplacer le mail, et la confirme apres
// (ranger.ts). Si la fonction est coupee ou si Supabase tombe entre les deux, la ligne reste
// « en_cours » : passe 2 min, les lectures du journal l'ignorent, et c'est ici que la tache
// planifiee de la boite la tranche, AVANT la reconciliation et l'automatique :
//   - le mail n'est plus en reception : le deplacement a eu lieu -> ligne confirmee, avec son
//     id Graph actuel. S'il a ete glisse depuis dans un autre dossier, la reconciliation qui
//     suit le voit comme pour tout rangement ;
//   - le mail est encore en reception : le deplacement n'a pas eu lieu -> ligne annulee par
//     « systeme », et le mail revient dans l'index de la reception (donc dans la file) ;
//   - introuvable dans la boite (supprime definitivement ?) -> ligne annulee et signalee (Sentry).
// Au plus 20 lignes par passage (un appel Graph chacune), les plus anciennes d'abord. Rien en
// simulation : une ligne simulee n'a rien deplace, et la reprise n'en lit que des reelles.

import { PAR_SYSTEME, DELAI_RANGEMENT_EN_COURS_MS } from "@/lib/domain/tri-emails";
import { signalerException } from "@/lib/observabilite";
import type { DepsRangement } from "./ranger";
import { marquerRemis, marquerSortis } from "./synchroniser-reception";

/** Au plus tant de lignes reprises par passage. */
const MAX_REPRISES = 20;

export interface BilanReprise {
  confirmees: number;
  annulees: number;
  introuvables: number;
  /** Relecture en echec (Graph, journal) : retentee au passage suivant. */
  echecs: number;
}

export async function reprendreEnCours(deps: DepsRangement, maintenant: () => number = Date.now): Promise<BilanReprise> {
  const bilan: BilanReprise = { confirmees: 0, annulees: 0, introuvables: 0, echecs: 0 };
  const boite = deps.boite;
  if (!boite || deps.simulation) return bilan;

  const avant = new Date(maintenant() - DELAI_RANGEMENT_EN_COURS_MS).toISOString();
  const lignes = await deps.repo.enCoursAReprendre(boite, avant, MAX_REPRISES);
  // Un par un : 20 appels Graph au plus, et un geste a la fois sur la boite.
  for (const e of lignes) {
    try {
      const pos = await deps.rangement.localiser(boite, e.internetMessageId);
      if (!pos) {
        if (await deps.repo.marquerAnnule(e.id, PAR_SYSTEME, "reprise : mail introuvable dans la boîte")) bilan.introuvables++;
        signalerException(new Error(`Rangement interrompu, mail introuvable : ${e.internetMessageId}`), {
          source: "cron-tri-emails",
          detail: { etape: "reprise", boite, journalId: e.id },
        });
        continue;
      }
      if (pos.enReception) {
        if (!(await deps.repo.marquerAnnule(e.id, PAR_SYSTEME, "reprise : le mail est resté en réception"))) continue;
        await marquerRemis(deps.index, boite, e.internetMessageId, pos.messageId);
        bilan.annulees++;
        continue;
      }
      await deps.repo.confirmerRangement(e.id, pos.messageId);
      await marquerSortis(deps.index, boite, [e.internetMessageId]);
      bilan.confirmees++;
    } catch (err) {
      bilan.echecs++;
      console.error(`[tri-emails] reprise de ${e.internetMessageId} :`, err instanceof Error ? err.message : err);
    }
  }
  return bilan;
}
