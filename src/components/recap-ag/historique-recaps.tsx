"use client";

// Historique des recaps AG : ce qui a ete enregistre, avec le depassement
// facture le cas echeant. Chaque ligne ouvre le recap en LECTURE (la meme vue que
// celle du comptable, cloisonnee au portefeuille cote serveur) : sans ce lien, un
// gestionnaire ne pouvait plus jamais relire ce qu'il avait saisi.
// La bascule « effectué » a ete RETIREE (decision Sekou 2026-09-08) : une coche sur
// un recap qu'on vient soi-meme de saisir n'avait pas de sens, et la boucle de suivi
// qui compte (« traité ») vit chez la comptable, dans sa file « Récaps d'AG reçus ».

import { useMemo, useState } from "react";
import { Section } from "@/components/ui/section";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { filtrerParPortee, type PorteeRecaps } from "@/lib/domain/recap-ag/mes-recaps";

/** Au-dela, on replie : une liste cabinet peut faire plusieurs centaines de lignes. */
const CAP_AFFICHAGE = 50;

export interface RecapAffiche {
  /** Ce recap releve-t-il de l'utilisateur ? (calcule cote serveur, cf. domain/recap-ag/mes-recaps) */
  mien: boolean;
  id: string;
  coproCode: string;
  agDate: string;
  statut: "nouveau" | "a_facturer" | "termine" | "erreur";
  depassementHeures: number;
  depassementTtc: number;
  nbTravaux: number;
  factureId?: string;
  par?: string;
  /** Horodatage ISO de creation (affiche date + heure). */
  creeLe: string;
}

function jour(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
/** Date + heure locale de creation. */
function quand(iso: string): string {
  const d = new Date(iso);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()} ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

const STATUT: Record<RecapAffiche["statut"], { label: string; ton: BadgeTon }> = {
  erreur: { label: "Échec", ton: "err" },
  a_facturer: { label: "Facturé", ton: "warn" },
  termine: { label: "Terminé", ton: "ok" },
  nouveau: { label: "Terminé", ton: "ok" },
};

export function HistoriqueRecaps({ recaps }: { recaps: RecapAffiche[] }) {
  // Defaut « moi » : l'ecran montrait les derniers recaps DU CABINET, donc chacun
  // cherchait les siens au milieu de ceux de 40 collegues.
  const [portee, setPortee] = useState<PorteeRecaps>("moi");
  const [deplie, setDeplie] = useState(false);

  const visibles = useMemo(() => filtrerParPortee(recaps, portee), [recaps, portee]);
  const affiches = deplie ? visibles : visibles.slice(0, CAP_AFFICHAGE);
  const reste = visibles.length - affiches.length;

  return (
    <Section
      id="recaps-enregistres"
      titre="Récaps enregistrés"
      compte={visibles.length}
      actions={
        <SegmentedControl<PorteeRecaps>
          label="Périmètre des récaps"
          value={portee}
          onChange={(p) => {
            setPortee(p ?? "moi");
            setDeplie(false);
          }}
          options={[
            { value: "moi", label: "Mes récaps" },
            { value: "tous", label: "Tous" },
          ]}
        />
      }
    >
      {visibles.length === 0 ? (
        <EmptyState>{portee === "moi" ? "Aucun récap sur vos copropriétés" : "Aucun récap"}</EmptyState>
      ) : (
        <>
          <Table>
            <Thead>
              <tr>
                <Th>Copro</Th>
                <Th>AG</Th>
                <Th>Saisi</Th>
                <Th numeric>Dépassement</Th>
                <Th numeric>Travaux</Th>
                <Th numeric>Statut</Th>
              </tr>
            </Thead>
            <Tbody>
              {affiches.map((r) => (
                <Tr key={r.id} interactive>
                  <Td code>
                    <LienLigne href={`/comptabilite/recaps/${r.id}`} className="font-mono">
                      {r.coproCode}
                    </LienLigne>
                  </Td>
                  <Td className="tabular-nums">{jour(r.agDate)}</Td>
                  <Td secondaire className="tabular-nums">
                    {quand(r.creeLe)}
                    {r.par ? ` · ${r.par}` : ""}
                  </Td>
                  <Td numeric secondaire={r.depassementHeures === 0}>
                    {r.depassementHeures > 0 ? `${r.depassementHeures} h · ${euros(r.depassementTtc)} TTC` : "—"}
                  </Td>
                  <Td numeric secondaire={r.nbTravaux === 0}>{r.nbTravaux > 0 ? r.nbTravaux : "—"}</Td>
                  <Td numeric>
                    <Badge ton={STATUT[r.statut].ton}>{STATUT[r.statut].label}</Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {reste > 0 && (
            <div>
              <Button variant="ghost" size="sm" onClick={() => setDeplie(true)}>
                Afficher les {reste} de plus
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
