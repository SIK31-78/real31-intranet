import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { pageAccueilPour } from "@/lib/auth/roles";

// Routage d'accueil CENTRALISE : le comptable pur atterrit sur son dashboard
// (/comptabilite), les autres sur /accueil (la home unifiee AG + dossiers). Sans session,
// pageAccueilPour renvoie /accueil, qui gere l'auth et redirige vers /dev-login si besoin.
export const dynamic = "force-dynamic";

export default async function Home() {
  const g = await getGestionnaireCourant();
  redirect(pageAccueilPour(g?.email, g?.role));
}
