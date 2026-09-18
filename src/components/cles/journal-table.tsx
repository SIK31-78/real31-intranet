import Link from "next/link";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { texteMouvement } from "@/lib/domain/cles/journal";
import type { MouvementEnrichi } from "@/lib/services/cles/lecture";

// Le journal des mouvements : date, heure, trousseau, quoi, qui. Chronologie inversee
// (le serveur la donne deja). Rendu serveur, zero JS.

function dateHeure(iso: string): { jour: string; heure: string } {
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const heure = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(d);
  return { jour, heure };
}

export function JournalTable({ lignes, avecTrousseau = true }: { lignes: MouvementEnrichi[]; avecTrousseau?: boolean }) {
  if (lignes.length === 0) return <EmptyState>Aucun mouvement</EmptyState>;
  return (
    <div className="overflow-x-auto">
      <Table dense>
        <Thead>
          <tr>
            <Th>Date</Th>
            {avecTrousseau && <Th>Trousseau</Th>}
            <Th>Mouvement</Th>
            <Th>Par</Th>
          </tr>
        </Thead>
        <Tbody>
          {lignes.map((m) => {
            const { jour, heure } = dateHeure(m.horodatageISO);
            const ton = m.type === "correction" || m.type === "introuvable" ? "warn" : undefined;
            return (
              <Tr key={m.id} ton={ton}>
                <Td secondaire className="whitespace-nowrap tabular-nums">{jour} <span className="text-ink-3">{heure}</span></Td>
                {avecTrousseau && (
                  <Td code>
                    {m.trousseauNumero ? <Link href={`/cles/trousseaux/${m.trousseauId}`} className="hover:underline">{m.trousseauNumero}</Link> : "—"}
                  </Td>
                )}
                <Td principal>{texteMouvement(m)}</Td>
                <Td secondaire className="whitespace-nowrap">{m.parNom}</Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
}
