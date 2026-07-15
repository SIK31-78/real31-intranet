// Service : destinataires du mail au conseil syndical, en CASCADE de deux sources
// (increment 2 "dates CS/AG"). Passe par le routeur (ADR-001).
//
//   1. eStale (SOURCE PRIMAIRE) : emails des membres du conseil (owner.email). Si au
//      moins un membre a un email -> on les utilise.
//   2. Liste de diffusion Crypto (FALLBACK) : la liste "conseil syndical" rapprochee de
//      la copro (parc encore sur Crypto jusqu'a janvier).
//   3. Sinon : aucune adresse -> le gestionnaire les saisit a la main dans l'UI.
//
// On ne devine JAMAIS : en cas de doute (aucune source fiable), on renvoie vide plutot
// que de pre-remplir des adresses hasardeuses.

import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { getListesDiffusionProvider } from "@/lib/adapters/router";

export type SourceDestinataires = "estale" | "crypto" | "aucune";

export interface DestinatairesConseil {
  source: SourceDestinataires;
  /** Adresses pre-remplies (peut etre vide si source = "aucune"). */
  emails: string[];
}

export async function destinatairesConseilSyndical(
  coproCode: string,
): Promise<DestinatairesConseil> {
  // 1. eStale : emails des membres du conseil. Degrade sans crasher si eStale tombe.
  try {
    const estale = await donneesCoproEstale(coproCode);
    const emails = uniques(
      (estale?.conseilSyndical ?? [])
        .map((m) => m.email?.trim())
        .filter((e): e is string => Boolean(e && e.includes("@"))),
    );
    if (emails.length > 0) return { source: "estale", emails };
  } catch {
    // eStale indisponible : on tente la liste Crypto.
  }

  // 2. Liste de diffusion Crypto de la copro.
  const liste = await getListesDiffusionProvider().listeCSPourCopro(coproCode);
  if (liste && liste.emails.length > 0) {
    return { source: "crypto", emails: uniques(liste.emails) };
  }

  // 3. Rien de fiable : saisie manuelle.
  return { source: "aucune", emails: [] };
}

/** Deduplique (insensible a la casse), ordre stable. */
function uniques(emails: string[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const cle = e.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(e);
  }
  return out;
}
