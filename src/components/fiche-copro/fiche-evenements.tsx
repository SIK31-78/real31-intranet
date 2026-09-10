import { CalendarOff } from "lucide-react";
import { grouperParJour } from "@/lib/domain/calendrier";
import type { Evenement } from "@/lib/domain/calendrier";
import { Badge, tonDeSeverite } from "@/components/ui/badge";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateLongue } from "@/lib/format-date";

const STATUT_LABEL: Record<Evenement["statut"], string> = {
  planifiee: "Planifié",
  convoquee: "Convoqué",
  tenue: "Tenu",
  annulee: "Annulé",
};

// Onglet "Evenements" de la fiche : les prochains evenements de la copro, un tableau
// dense, groupe par jour (la date n'est ecrite que sur la premiere ligne du jour).
export function FicheEvenements({ evenements }: { evenements: Evenement[] }) {
  if (evenements.length === 0) {
    return <EmptyState icone={CalendarOff}>Aucun événement à venir</EmptyState>;
  }

  const jours = grouperParJour(evenements);

  return (
    <Table>
      <Thead>
        <tr>
          <Th>Date</Th>
          <Th>Heure</Th>
          <Th>Type</Th>
          <Th>Statut</Th>
          <Th numeric>Échéance</Th>
        </tr>
      </Thead>
      <Tbody>
        {jours.map((jour) =>
          jour.evenements.map((e, i) => (
            <Tr key={e.id}>
              <Td principal>{i === 0 ? formatDateLongue(jour.date) : ""}</Td>
              <Td secondaire className="tabular-nums">{e.heure ?? "-"}</Td>
              <Td>
                <Badge ton="outline">{e.type}</Badge>
              </Td>
              <Td secondaire>{STATUT_LABEL[e.statut]}</Td>
              <Td numeric>{e.jalon && <Badge ton={tonDeSeverite(e.jalon.severite)}>{e.jalon.label}</Badge>}</Td>
            </Tr>
          )),
        )}
      </Tbody>
    </Table>
  );
}
