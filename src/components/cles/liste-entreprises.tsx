"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/field";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";

export interface EntrepriseLigne {
  id: string;
  nom: string;
  telephone?: string;
  email?: string;
  detenus: number;
  enRetard: number;
  bloquee: boolean;
}

type Filtre = "toutes" | "detiennent" | "retard" | "bloquees";

export function ListeEntreprises({ entreprises }: { entreprises: EntrepriseLigne[] }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre | null>("toutes");
  const visibles = useMemo(() => {
    const termes = normaliserTexte(q).split(" ").filter(Boolean);
    return entreprises
      .filter((e) => (filtre === "detiennent" ? e.detenus > 0 : filtre === "retard" ? e.enRetard > 0 : filtre === "bloquees" ? e.bloquee : true))
      .filter((e) => termes.every((t) => normaliserTexte(`${e.nom} ${e.telephone ?? ""} ${e.email ?? ""}`).includes(t)));
  }, [entreprises, q, filtre]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<Filtre>
          label="Filtrer"
          value={filtre}
          onChange={(v) => setFiltre(v ?? "toutes")}
          size="sm"
          options={[
            { value: "toutes", label: "Toutes" },
            { value: "detiennent", label: `Détiennent · ${entreprises.filter((e) => e.detenus > 0).length}` },
            { value: "retard", label: `En retard · ${entreprises.filter((e) => e.enRetard > 0).length}`, ton: entreprises.some((e) => e.enRetard > 0) ? "err" : undefined },
            { value: "bloquees", label: `Bloquées · ${entreprises.filter((e) => e.bloquee).length}` },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, téléphone, e-mail…" largeur="auto" className="sm:w-64" aria-label="Rechercher une entreprise" autoFocus />
      </div>
      {visibles.length === 0 ? <EmptyState compact>Aucune entreprise ne correspond</EmptyState> : (
        <Rows>
          {visibles.slice(0, 300).map((e) => (
            <Row
              key={e.id}
              href={`/cles/entreprises/${e.id}`}
              ton={e.enRetard > 0 ? "err" : undefined}
              principal={e.nom}
              secondaire={[e.telephone, e.email].filter(Boolean).join(" · ")}
              droite={
                <>
                  {e.bloquee && <Badge ton="err">bloquée</Badge>}
                  {e.enRetard > 0 ? <Badge ton="err" dot>{e.enRetard} en retard</Badge> : e.detenus > 0 ? <Badge ton="warn" dot>détient {e.detenus}</Badge> : null}
                </>
              }
            />
          ))}
          {visibles.length > 300 && <li className="px-4 py-2 text-meta text-ink-3">{visibles.length - 300} de plus : affine la recherche.</li>}
        </Rows>
      )}
    </div>
  );
}
