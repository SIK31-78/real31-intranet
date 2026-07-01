// L'analyse des documents vit desormais DANS la fiche-hub d'un dossier de reprise
// (/reprise-copro/dossiers/[id], zone Patrimoine). Le workflow est : creer d'abord une
// reprise (nom + ref S0XXX + adresse), puis analyser depuis sa fiche.
//
// Cette route historique redirige donc vers la liste des dossiers, ou l'on cree une reprise.

import { redirect } from "next/navigation";

export default function NouvelleReprisePage() {
  redirect("/reprise-copro/dossiers");
}
