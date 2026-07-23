import { redirect } from "next/navigation";

// Ancienne home S3.A : "Mes dossiers" a ete absorbee par l'accueil. On REDIRIGE
// plutot que supprimer, pour ne pas casser un bookmark existant.
export default function MesDossiersPage() {
  redirect("/accueil");
}
