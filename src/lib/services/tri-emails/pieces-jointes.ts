// Pieces jointes d'un mail de la file a trier (ADR-046) : lister, puis lire pour l'apercu
// (une facture ou un devis dit souvent la copro mieux que le mail). LECTURE SEULE, toujours
// dans la boite triee passee par l'appelant (verifiee contre la config et les droits de la
// personne en amont) : l'adapter retrouve le mail par son internetMessageId DANS cette
// boite, on ne peut donc pas lire la piece jointe d'une autre boite.

import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { BOITE_ECHANTILLON } from "@/lib/domain/mail-gate";
import { getMailboxProvider } from "@/lib/adapters/router";

function boiteLisible(boite: string | null | undefined): string | null {
  // L'echantillon est fictif : ses pieces jointes n'existent nulle part.
  return boite && boite !== BOITE_ECHANTILLON ? boite : null;
}

export async function listerPiecesJointesTri(boite: string, internetMessageId: string): Promise<PieceJointeRef[]> {
  const lisible = boiteLisible(boite);
  if (!lisible) return [];
  return getMailboxProvider().listerPiecesJointes({ boite: lisible, internetMessageId });
}

export async function lirePieceJointeTri(
  boite: string,
  internetMessageId: string,
  attachmentId: string,
): Promise<{ nom: string; type: string; base64: string }> {
  const lisible = boiteLisible(boite);
  if (!lisible) throw new Error("Pas d'aperçu pour les mails fictifs de l'échantillon.");
  return getMailboxProvider().lirePieceJointe({ boite: lisible, internetMessageId, attachmentId });
}
