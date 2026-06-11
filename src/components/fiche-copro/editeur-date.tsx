"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { formatDateLongue } from "@/lib/format-date";
import { definirDateAg, definirDateCs } from "./dates-actions";

// Edition inline d'une date d'AG / CS (si pas encore tenue). Vide = deplanifier.
export function EditeurDate({
  coproCode,
  type,
  dateISO,
}: {
  coproCode: string;
  type: "ag" | "cs";
  dateISO?: string;
}) {
  const [edition, setEdition] = useState(false);
  const [valeur, setValeur] = useState(dateISO ?? "");
  const [pending, startTransition] = useTransition();
  const action = type === "ag" ? definirDateAg : definirDateCs;

  const enregistrer = () => {
    startTransition(async () => {
      await action(coproCode, valeur);
      setEdition(false);
    });
  };

  if (!edition) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[16px] font-medium text-ink">
          {dateISO ? formatDateLongue(dateISO) : "Non planifiée"}
        </span>
        <button
          type="button"
          onClick={() => {
            setValeur(dateISO ?? "");
            setEdition(true);
          }}
          className="text-ink-3 hover:text-ink-2"
          title="Modifier la date"
        >
          <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        value={valeur}
        onChange={(e) => setValeur(e.target.value)}
        className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px]"
      />
      <button
        type="button"
        disabled={pending}
        onClick={enregistrer}
        className="h-8 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 disabled:opacity-50"
      >
        OK
      </button>
      <button
        type="button"
        onClick={() => setEdition(false)}
        className="h-8 px-2 rounded-sm border border-line text-[12px] text-ink-2 hover:border-line-2"
      >
        Annuler
      </button>
    </span>
  );
}
