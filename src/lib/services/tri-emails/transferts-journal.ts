// À qui sont partis les mails de la colonne « Transférés » du journal du tri (REA-500, validé
// par Sekou le 06/11/2026). Aucune colonne de plus au journal : la trace « Transféré à … par … »
// écrite au transfert est une note interne du mail (ADR-053) ; on la relit ici, en UNE lecture
// groupée par internetMessageId, pour les seules lignes du dossier « Transférés ».
// Best-effort : table des notes absente ou en panne, l'onglet s'affiche sans les destinataires.

import type { NoteInterne } from "@/lib/domain/boite-equipe";
import type { DossierHorsBinome, EntreeJournalTri } from "@/lib/domain/tri-emails";
import { destinatairesDuTransfert } from "@/lib/domain/transfert-tri";
import type { BoiteEquipeRepository } from "@/lib/ports/boite-equipe-repository";
import { getBoiteEquipeRepository } from "@/lib/adapters/router";

const TRANSFERES: DossierHorsBinome = "transferes";

/** id de ligne du journal -> adresses du transfert (À puis Cc). Une ligne sans trace lisible n'y est pas. */
export async function destinatairesDesTransferts(
  journal: readonly Pick<EntreeJournalTri, "id" | "internetMessageId" | "dossierCle" | "faitLe">[],
  repo: Pick<BoiteEquipeRepository, "notesDe"> = getBoiteEquipeRepository(),
): Promise<Record<string, string[]>> {
  const lignes = journal.filter((e) => e.dossierCle === TRANSFERES);
  if (!lignes.length) return {};
  let notes: NoteInterne[] | null;
  try {
    notes = await repo.notesDe([...new Set(lignes.map((e) => e.internetMessageId))]);
  } catch (e) {
    console.error("[tri-emails] traces des transferts :", e instanceof Error ? e.message : e);
    return {};
  }
  if (!notes) return {};
  const parMail = new Map<string, { texte: string; creeLe: string }[]>();
  for (const n of notes) parMail.set(n.internetMessageId, [...(parMail.get(n.internetMessageId) ?? []), n]);
  const out: Record<string, string[]> = {};
  for (const e of lignes) {
    const adresses = destinatairesDuTransfert(parMail.get(e.internetMessageId) ?? [], e.faitLe);
    if (adresses) out[e.id] = adresses;
  }
  return out;
}
