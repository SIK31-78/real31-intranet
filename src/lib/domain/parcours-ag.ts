// RE-EXPORT de retro-compat (S1 refonte, 2026-07-21). Le parcours AG vit
// desormais dans domain/cycle-ag (LA source unique : etat + etape + action du
// moment = projections du meme calcul). Nouvelles ecritures : importer
// "@/lib/domain/cycle-ag" directement.

export {
  agDueDeadline,
  agTenuePourExerciceCourant,
  construireLigne,
  estDateeEnCycle,
  estEnParcours,
  PARCOURS_HORIZON,
  PARCOURS_RETRO,
} from "@/lib/domain/cycle-ag";
