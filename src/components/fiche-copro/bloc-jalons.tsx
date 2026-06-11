"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { ListChecks, ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { JalonAvecEtat, StatutJalon } from "@/lib/domain/jalons-ag/types";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue } from "@/lib/format-date";
import { marquerJalon } from "./jalons-actions";

const STATUTS: { value: StatutJalon; label: string; actif: string }[] = [
  { value: "a_faire", label: "À faire", actif: "bg-surface-2 text-ink-2 border-line-2" },
  { value: "accompli", label: "Accompli", actif: "bg-ok-50 text-ok-700 border-ok-500/30" },
  { value: "en_alerte", label: "Alerte", actif: "bg-err-50 text-err-700 border-err-500/30" },
];

export function BlocJalons({
  jalons,
  coproCode,
  agDate,
}: {
  jalons: JalonAvecEtat[];
  coproCode: string;
  agDate: string;
}) {
  if (jalons.length === 0) return null;
  const faits = jalons.filter((j) => j.statut === "accompli").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <ListChecks strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Jalons réglementaires de la prochaine AG
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge ton="outline" className="font-mono">{faits} / {jalons.length}</Badge>
          <Link
            href={`/supervision-ag/${coproCode}__${agDate}`}
            className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors"
          >
            Supervision AG
            <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
          </Link>
        </div>
      </CardHeader>
      <ul className="divide-y divide-line">
        {jalons.map((j) => (
          <JalonRow key={j.code} jalon={j} coproCode={coproCode} agDate={agDate} />
        ))}
      </ul>
    </Card>
  );
}

function JalonRow({
  jalon,
  coproCode,
  agDate,
}: {
  jalon: JalonAvecEtat;
  coproCode: string;
  agDate: string;
}) {
  const [pending, startTransition] = useTransition();
  const [statutOpt, setStatutOpt] = useOptimistic(jalon.statut);

  const onSet = (statut: StatutJalon) => {
    if (statut === statutOpt) return;
    startTransition(async () => {
      setStatutOpt(statut);
      await marquerJalon(coproCode, agDate, jalon.code, statut);
    });
  };

  return (
    <li className={cn("flex items-center gap-3 px-4 py-2.5 transition-opacity", pending && "opacity-60")}>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-ink">{jalon.libelle}</p>
        <p className="text-[11px] text-ink-3">
          Cible {formatDateLongue(jalon.cibleDate)} · {jalon.source === "legal" ? "Légal" : "Cabinet"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {STATUTS.map((s) => (
          <button
            key={s.value}
            type="button"
            disabled={pending}
            onClick={() => onSet(s.value)}
            aria-pressed={statutOpt === s.value}
            className={cn(
              "h-7 px-2 rounded-sm border text-[11px] font-medium transition-colors duration-75 disabled:cursor-not-allowed",
              statutOpt === s.value ? s.actif : "bg-surface text-ink-3 border-line hover:border-line-2",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
    </li>
  );
}
