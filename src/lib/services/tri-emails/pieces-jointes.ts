// Pieces jointes d'un mail de la file a trier (ADR-046) : lister, puis lire pour l'apercu
// (une facture ou un devis dit souvent la copro mieux que le mail). LECTURE SEULE, toujours
// dans la boite generique configuree : l'adapter retrouve le mail par son internetMessageId
// DANS cette boite, on ne peut donc pas lire la piece jointe d'une autre boite.

import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { boiteTriConfiguree } from "@/lib/domain/mail-gate";
import { getMailboxProvider } from "@/lib/adapters/router";

function boiteLisible(): string | null {
  const boite = boiteTriConfiguree();
  // L'echantillon est fictif : ses pieces jointes n'existent nulle part.
  return boite && boite !== "echantillon" ? boite : null;
}

export async function listerPiecesJointesTri(internetMessageId: string): Promise<PieceJointeRef[]> {
  const boite = boiteLisible();
  if (!boite) return [];
  return getMailboxProvider().listerPiecesJointes({ boite, internetMessageId });
}

export async function lirePieceJointeTri(
  internetMessageId: string,
  attachmentId: string,
): Promise<{ nom: string; type: string; base64: string }> {
  const boite = boiteLisible();
  if (!boite) throw new Error("Pas d'aperçu pour les mails fictifs de l'échantillon.");
  return getMailboxProvider().lirePieceJointe({ boite, internetMessageId, attachmentId });
}
