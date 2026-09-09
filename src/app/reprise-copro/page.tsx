// Entrée du module Reprise de copropriété (ADR-037) : le module EST le tableau de suivi
// d'équipe. Plus de hub intermédiaire (l'import se fait au terminal avec le skill
// `estale-migration`) -> on renvoie directement sur la liste des reprises.

import { redirect } from "next/navigation";

export default function RepriseAccueil() {
  redirect("/reprise-copro/dossiers");
}
