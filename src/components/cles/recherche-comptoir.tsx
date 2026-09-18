"use client";

// La barre du comptoir : un champ, focus a l'arrivee, des resultats SIMPLES : une copro (ses
// trousseaux s'affichent dessous au clic), une entreprise, ou un trousseau par son numero.
// Clavier complet (useCombobox). Un numero tape ouvre le trousseau exact avec Entree.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, KeySquare, Search, Store } from "lucide-react";
import { Input } from "@/components/ui/field";
import { useCombobox } from "@/components/ui/combobox";
import { filtrerIndex, type EntreeIndex } from "@/lib/domain/cles/recherche";
import { LIBELLE_ETAT, TON_ETAT } from "@/lib/domain/cles/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

function hrefDe(e: EntreeIndex): string {
  switch (e.kind) {
    case "trousseau":
      return `/cles/trousseaux/${e.id}`;
    case "copro":
      return `/cles?copro=${encodeURIComponent(e.code)}`;
    case "entreprise":
      return `/cles/entreprises/${e.id}`;
  }
}

export function RechercheComptoir({ index, autoFocus = true, placeholder }: { index: EntreeIndex[]; autoFocus?: boolean; placeholder?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const resultats = useMemo(() => filtrerIndex(index, q), [index, q]);
  const aller = (e: EntreeIndex) => { setQ(""); router.push(hrefDe(e)); };
  const combobox = useCombobox(resultats, aller, () => setQ(""));

  return (
    <div className="relative">
      <div className="relative">
        <Search strokeWidth={1.5} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" aria-hidden />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={combobox.onKeyDown}
          {...combobox.input}
          autoFocus={autoFocus}
          placeholder={placeholder ?? "Copropriété, adresse, numéro de trousseau, entreprise…"}
          aria-label="Rechercher un trousseau, une copropriété ou une entreprise"
          className="pl-9 h-9"
          autoComplete="off"
        />
      </div>
      {resultats.length > 0 && (
        <ul {...combobox.liste} className="absolute z-20 mt-1 w-full max-h-[420px] overflow-auto rounded-lg border border-line bg-surface shadow-2 py-1">
          {resultats.map((e, i) => (
            <li
              key={`${e.kind}-${e.kind === "copro" ? e.code : e.id}`}
              {...combobox.option(i)}
              onMouseDown={(ev) => { ev.preventDefault(); aller(e); }}
              className={cn("flex items-center gap-3 px-3 min-h-9 py-1.5 text-body cursor-pointer", i === combobox.actif ? "bg-surface-2" : "hover:bg-surface-2/60")}
            >
              {e.kind === "trousseau" && (
                <>
                  <KeySquare strokeWidth={1.5} className="w-4 h-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="font-mono text-ink-2 shrink-0">{e.numero}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-ink">{e.libelle || e.biens}</span>
                    {e.libelle && <span className="text-ink-2"> · {e.biens}</span>}
                  </span>
                  <Badge ton={TON_ETAT[e.etat]} dot>{LIBELLE_ETAT[e.etat]}{e.detenteur ? ` · ${e.detenteur}` : ""}</Badge>
                </>
              )}
              {e.kind === "copro" && (
                <>
                  <Building2 strokeWidth={1.5} className="w-4 h-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="font-mono text-ink-2 shrink-0">{e.code}</span>
                  <span className="min-w-0 flex-1 truncate"><span className="font-medium text-ink">{e.nom}</span><span className="text-ink-2"> · {e.adresse}</span>{(e.gestionnaire || e.assistant) && <span className="text-ink-2"> · {[e.gestionnaire, e.assistant].filter(Boolean).join(" / ")}</span>}</span>
                  <Badge ton="neutral">{e.trousseaux} trousseau{e.trousseaux > 1 ? "x" : ""} · voir</Badge>
                </>
              )}
              {e.kind === "entreprise" && (
                <>
                  <Store strokeWidth={1.5} className="w-4 h-4 shrink-0 text-ink-3" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{e.nom}</span>
                  {e.bloquee && <Badge ton="err">bloquée</Badge>}
                  {e.enRetard > 0 ? <Badge ton="err" dot>{e.enRetard} en retard</Badge> : e.detenus > 0 ? <Badge ton="warn" dot>détient {e.detenus}</Badge> : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
