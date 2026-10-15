// L'historique de la conversation sous un mail reçu (Mahaut, 15/10/2026 : « on ne sait pas
// à quel mail elle reçoit une réponse »). Le corps affiché est coupé avant le message cité
// (cleanBody, fait pour le tri) ; l'historique se relit au clic, pour ne pas alourdir la
// page avec des fils parfois très longs. Lu dans la boîte qui détient le mail.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import { getRechercheMail } from "@/lib/adapters/router";
import { historiqueCite } from "@/lib/domain/tri-mail/clean";

export async function historiqueDuMail(boite: string, internetMessageId: string): Promise<string> {
  const moteur = getRechercheMail();
  const m = await moteur.trouver({ boite, internetMessageId });
  if (!m) return "";
  const corps = await moteur.lireCorps({ boite, id: m.id });
  return historiqueCite({ subject: m.objet, bodyText: corps });
}
