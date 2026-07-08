"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { formatDateLongue, formatHeure } from "@/lib/format-date";
import { HEURE_DEFAUT_REUNION } from "@/lib/domain/reunion";
import { definirDateAg, definirDateCs } from "./dates-actions";

// Edition inline d'une date d'AG / CS. `quand` = prochaine (planifiee) ou derniere
// (tenue, correction du referentiel App A). Clic sur la date -> selecteur ; choisir
// une date l'enregistre directement (pas de bouton "OK"). "Effacer" = RAZ (deplanifier).
// Une PROCHAINE reunion porte aussi une HEURE (pre-remplie a 18:00, modifiable) : la
// date + l'heure sont combinees en 'YYYY-MM-DDTHH:mm:00' a l'enregistrement. La
// derniere date (correction du referentiel, passee) n'a pas d'heure de reunion.
export function EditeurDate({
  coproCode,
  type,
  dateISO,
  heure,
  quand = "prochaine",
}: {
  coproCode: string;
  type: "ag" | "cs";
  dateISO?: string;
  /** Heure existante "HH:mm" (prochaine reunion) ; absente = journee entiere. */
  heure?: string;
  quand?: "prochaine" | "derniere";
}) {
  const [edition, setEdition] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dateVal, setDateVal] = useState(dateISO ?? "");
  // L'heure ne concerne que la PROCHAINE reunion : pre-remplie a l'heure existante,
  // sinon a l'heure par defaut (18:00). Masquee (et vide) pour une date "derniere".
  const avecHeure = quand === "prochaine";
  const [heureVal, setHeureVal] = useState(avecHeure ? (heure ?? HEURE_DEFAUT_REUNION) : "");
  const action = type === "ag" ? definirDateAg : definirDateCs;
  const labelVide = quand === "derniere" ? "Non renseignée" : "Non planifiée";

  // Combine date + heure en 'YYYY-MM-DDTHH:mm:00' (datetime) ou en date pure si pas
  // d'heure (derniere date). Date vide -> "" (effacer, comme avant).
  const combiner = (date: string, h: string): string =>
    date && h ? `${date}T${h}:00` : date;

  const enregistrer = (valeur: string) => {
    startTransition(async () => {
      await action(coproCode, valeur, quand);
      setEdition(false);
    });
  };

  // N'enregistre que quand l'annee est complete (4 chiffres) : evite de sauver
  // "0002" pendant la frappe de "2026".
  const dateComplete = (v: string) => Boolean(v) && Number(v.slice(0, 4)) >= 1000;

  if (!edition) {
    return (
      <button
        type="button"
        onClick={() => setEdition(true)}
        className="inline-flex items-center gap-1.5 text-[16px] font-medium text-ink hover:text-green-700 transition-colors"
        title="Modifier la date"
      >
        {dateISO ? (
          <span>
            {formatDateLongue(dateISO)}
            {avecHeure && heure && <span className="text-ink-3"> à {formatHeure(heure)}</span>}
          </span>
        ) : (
          <span className="text-ink-3">{labelVide}</span>
        )}
        <Pencil strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <input
        type="date"
        value={dateVal}
        autoFocus
        disabled={pending}
        aria-label={`Date ${quand === "derniere" ? "de la dernière" : "de la prochaine"} ${type === "ag" ? "AG" : "réunion de CS"}`}
        onChange={(e) => {
          const v = e.target.value;
          setDateVal(v);
          if (dateComplete(v)) enregistrer(combiner(v, heureVal));
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEdition(false);
        }}
        className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
      />
      {avecHeure && (
        <input
          type="time"
          value={heureVal}
          disabled={pending}
          aria-label={`Heure de la prochaine ${type === "ag" ? "AG" : "réunion de CS"}`}
          onChange={(e) => {
            const h = e.target.value;
            setHeureVal(h);
            // Ne re-sauve que si une date valide est deja saisie (l'heure seule
            // n'a pas de sens). Si l'heure est effacee -> date pure.
            if (dateComplete(dateVal)) enregistrer(combiner(dateVal, h));
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEdition(false);
          }}
          className="h-8 px-2 rounded-sm border border-line bg-surface text-[13px] disabled:opacity-50"
        />
      )}
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
