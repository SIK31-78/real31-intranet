import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estVueComptable } from "@/lib/auth/roles";

// Le dashboard est DEMANTELE (decision Sekou 2026-07-22) : chaque bloc a rejoint son
// "chez lui" - l'accueil (en-tete "Bonjour", annonces, bandeau "a prendre en main",
// points signales) et "Toutes les coproprietes" (pipeline des AG). On garde une simple
// REDIRECTION plutot qu'une suppression du fichier : les bookmarks et les redirect
// residuels vers /dashboard (gates) restent valides, et le geste est reversible.
//
// La garde comptable est PRESERVEE : un comptable pur atterrit sur son dashboard
// comptable (/comptabilite), tout le monde d'autre sur /accueil (la home unifiee).
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (estVueComptable(g.email, g.role)) redirect("/comptabilite");
  redirect("/accueil");
}
