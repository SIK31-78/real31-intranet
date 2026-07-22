import { redirect } from "next/navigation";

// Ex-page "Actions" (worklist), ABSORBEE par l'accueil a la bascule Sequence 3.B :
// echeances AG (bandeau) + dossiers en cours y vivent desormais. On REDIRIGE plutot que
// supprimer tout le stack (service / domaine / port / adapter / cablage router restent
// dormants) : un bookmark existant ne casse pas, et le retour arriere est trivial si on
// veut ressusciter la worklist. Choix le plus sur (design valide Sekou).
export default function MesEvenementsPage() {
  redirect("/accueil");
}
