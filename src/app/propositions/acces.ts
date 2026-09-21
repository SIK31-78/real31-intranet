// La garde des pages du module Propositions : une session, et le droit de voir le module
// (habilitation `propositions`, ou super-admin). Sans droit : retour a l'accueil, sans bruit.

import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutVoirPropositions, profilDe } from "@/lib/auth/roles";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";

export async function exigerAccesPropositions(): Promise<Gestionnaire> {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!peutVoirPropositions(profilDe(g))) redirect("/accueil");
  return g;
}
