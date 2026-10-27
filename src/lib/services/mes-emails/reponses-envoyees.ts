// La réponse partie de la boîte à un mail reçu, pour la relire sous le mail (« qu'est-ce
// que ma collègue a répondu ? », Sekou 15/10/2026). Lu à la demande, au clic : aucun coût à
// l'affichage de la page. On retrouve le fil Outlook (conversationId) du mail reçu, puis
// ses messages dans les éléments envoyés de la MÊME boîte. Une réponse faite depuis une
// autre boîte (la perso pour un mail de la boîte partagée) n'y est pas.
// Passe par le routeur, jamais un adapter en direct (ADR-001).

import type { ReponseEnvoyee } from "@/lib/domain/echanges";
import { getRechercheMail } from "@/lib/adapters/router";

const MAX_REPONSES = 3;

export async function reponsesEnvoyees(boite: string, internetMessageId: string): Promise<ReponseEnvoyee[]> {
  const moteur = getRechercheMail();
  const recu = await moteur.trouver({ boite, internetMessageId });
  if (!recu?.conversationId) return [];
  return moteur.envoyesDuFil({ boite, conversationId: recu.conversationId, apres: recu.date, max: MAX_REPONSES });
}
