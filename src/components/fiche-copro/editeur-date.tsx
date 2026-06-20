"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { formatDateLongue } from "@/lib/format-date";
import { definirDateAg, definirDateCs } from "./dates-actions";

// Edition inline d'une date d'AG / CS. `quand` = prochaine (planifiee) ou derniere
// (tenue, correction du referentiel App A). Clic sur la date -> selecteur ; choisir
// une date l'enregistre directement (pas de bouton "OK"). "Effacer" = RAZ (deplanifier).
export function EditeurDate({
  coproCode,
  type,
  dateISO,
  quand = "prochaine",
}: {
  coproCode: string;
  type: "ag" | "cs";
  dateISO?: string;
  quand?: "prochaine" | "derniere";
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const action = type === "ag" ? definirDateAg : definirDateCs;
  const labelVide = quand === "derniere" ? "Non renseignée" : "Non planifiée";

  const enregistrer = (valeur: string) => {
    startTransition(async () => {
      await action(coproCode, valeur, quand);
      setEdition(false);
    });
  };

  if (!edition) {
    return (
      <button
        type="button"
        onClick={() => setEdition(true)}
        className="inline-flex items-center gap-1.5 text-[16px] font-medium text-ink hover:text-green-700 transition-colors"
        title="Modifier la date"
      >
        {dateISO ? formatDateLongue(dateISO) : <span className="text-ink-3">{labelVide}</span>}
        <Pencil strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        defaultValue={dateISO ?? ""}
        autoFocus
        disabled={pending}
        aria-label={`Date ${quand === "derniere" ? "de la dernière" : "de la prochaine"} ${type === "ag" ? "AG" : "réunion de CS"}`}
        onChange={(e) => {
          if (e.target.value) enregistrer(e.target.value); // choisir une date = enregistrer
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEdition(false);
        }}
        className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
      />
      {dateISO && (
        <button
          type="button"
          disabled={pending}
          onClick={() => enregistrer("")}
          className="inline-flex items-center gap-1 h-8 px-2 rounded-sm border border-line text-[12px] text-ink-2 hover:border-err-500 hover:text-err-700 disabled:opacity-50 transition-colors"
          title="Effacer la date (déplanifier)"
        >
          <X strokeWidth={2} className="w-3.5 h-3.5" /> Effacer
        </button>
      )}
      <button
        type="button"
        onClick={() => setEdition(false)}
        className="h-8 px-2 rounded-sm border border-line text-[12px] text-ink-2 hover:border-line-2 transition-colors"
      >
        Annuler
      </button>
    </span>
  );
}
