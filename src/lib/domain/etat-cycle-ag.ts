// RE-EXPORT de retro-compat (S1 refonte, 2026-07-21). L'etat du cycle AG vit
// desormais dans domain/cycle-ag (LA source unique : etat + etape + action du
// moment = projections du meme calcul). Nouvelles ecritures : importer
// "@/lib/domain/cycle-ag" directement.

export {
  etatCycleAg,
  ETAT_CYCLE_LABEL,
  ETAT_CYCLE_ORDRE,
  type EtatCycle,
  type EtatCycleInfo,
} from "@/lib/domain/cycle-ag";
