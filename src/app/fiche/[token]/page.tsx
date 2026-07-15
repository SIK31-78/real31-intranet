// Page PUBLIQUE de la fiche de renseignements (coproprietaire, NON authentifie). Premiere
// page non protegee de l'app (le proxy exclut /fiche/**). Server component minimal : il ne
// fait AUCUN lookup et ne revele RIEN (anti-enumeration) - il passe juste le token (issu de
// l'URL) au composant client, qui demande le code personnel avant tout affichage.

import type { Metadata } from "next";
import { FichePublique } from "./fiche-publique";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Fiche de renseignements - REAL31",
  robots: { index: false, follow: false },
};

export default async function FichePubliquePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <FichePublique token={decodeURIComponent(token)} />;
}
