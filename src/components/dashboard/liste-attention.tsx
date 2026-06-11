"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { JalonPill } from "@/components/ui/jalon-pill";
import type { ItemAttention } from "@/lib/domain/dashboard";

type Filtre = "all" | "late" | "soon";

const FILTRES: { key: Filtre; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "late", label: "En retard" },
  { key: "soon", label: "≤ 7 jours" },
];

function garde(filtre: Filtre, item: ItemAttention): boolean {
  if (filtre === "all") return true;
  if (filtre === "late") return item.jalon.severite === "late";
  return item.jalon.severite === "late" || item.jalon.severite === "soon";
}

export function ListeAttention({ items }: { items: ItemAttention[] }) {
  const [filtre, setFiltre] = useState<Filtre>("all");
  const visibles = items.filter((item) => garde(filtre, item));

  return (
    <Card>
      <CardHeader>
        <CardTitle>À traiter, par ordre d&apos;urgence</CardTitle>
        <div className="flex items-center gap-1" role="group" aria-label="Filtrer les tâches">
          {FILTRES.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filtre === f.key ? "secondary" : "ghost"}
              aria-pressed={filtre === f.key}
              onClick={() => setFiltre(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <div>
        {visibles.map((item) => {
          const cls =
            "flex items-center gap-3 px-4 py-[11px] border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-75";
          const contenu = (
            <>
              <JalonPill label={item.jalon.label} severite={item.jalon.severite} />
              <span className="font-mono text-[12px] text-ink-2 w-[38px] shrink-0">{item.coproCode}</span>
              <span className="flex-1 text-[13px] min-w-0">{item.titre}</span>
              {item.badge ? (
                <Badge ton={item.badge.ton} dot>
                  {item.badge.texte}
                </Badge>
              ) : item.echeance ? (
                <span className="font-mono text-[12px] text-ink-3">{item.echeance}</span>
              ) : null}
              <ChevronRight strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
            </>
          );
          return item.lien ? (
            <Link key={item.id} href={item.lien} className={cls}>
              {contenu}
            </Link>
          ) : (
            <div key={item.id} className={cls}>
              {contenu}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2.5 text-[12px] text-ink-3 border-t border-line">
        {visibles.length} tâche{visibles.length > 1 ? "s" : ""} à traiter ·{" "}
        <Link href="/copropriete" className="text-green-700">
          voir toutes mes copropriétés
        </Link>
      </div>
    </Card>
  );
}
