"use client";

import { useTransition } from "react";
import type { PointLegal } from "@/lib/domain/odj";

export function PointLegalRow({
  point,
  onToggle,
}: {
  point: PointLegal;
  onToggle: (pointId: string, retire: boolean) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const retire = !point.applicable;

  const toggle = () => {
    startTransition(async () => {
      await onToggle(point.id, !retire);
    });
  };

  return (
    <li className={`px-4 py-3 ${pending ? "opacity-60" : ""} ${retire ? "bg-surface-2" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`text-[13px] font-medium ${retire ? "text-ink-4 line-through" : "text-ink"}`}>
          {point.titre}
        </span>
        {point.condition && !retire && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-warn-50 text-warn-700">conditionnel</span>
        )}
        {retire && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-surface-3 text-ink-3">retire de l&apos;ODJ</span>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={toggle}
          className="ml-auto h-7 px-2.5 rounded-sm border border-line bg-surface text-[12px] text-ink-2 hover:border-line-2 disabled:opacity-50 shrink-0"
        >
          {retire ? "Restaurer" : "Retirer"}
        </button>
      </div>
      {!retire && (
        <>
          {point.condition && <p className="text-[11.5px] text-warn-700 mt-1">{point.condition}</p>}
          <p className="text-[12.5px] text-ink-2 mt-1 leading-snug">{point.texte}</p>
        </>
      )}
    </li>
  );
}
