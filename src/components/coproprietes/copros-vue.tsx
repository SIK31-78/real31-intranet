"use client";

// Pilotage du portefeuille : bascule Liste / Pipeline (kanban par etat du cycle AG).
// Filtres source / etat / exercice. Decision Sekou 2026-06-22 (cockpit).

import { useMemo, useState } from "react";
import Link from "next/link";
import { List, LayoutGrid, Search, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { libelleSource } from "@/lib/domain/copropriete";
import { ETAT_CYCLE_LABEL, ETAT_CYCLE_ORDRE, type EtatCycle } from "@/lib/domain/etat-cycle-ag";
import type { CoproPilotage } from "@/lib/services/coproprietes/get-copros-pilotage";

const ETAT_TON: Record<EtatCycle, "neutral" | "warn" | "info" | "ok"> = {
  a_planifier: "neutral",
  a_venir: "neutral",
  en_preparation: "warn",
  convoquee: "info",
  tenue: "ok",
};

function echeance(c: CoproPilotage): string {
  if (c.etat === "a_planifier") return c.enRetard ? "en retard" : "à planifier";
  if (c.etat === "tenue") return "suivi post-AG";
  if (c.agDate) return `AG ${c.agDate.slice(8, 10)}/${c.agDate.slice(5, 7)}`;
  return "-";
}

function rangCloture(c: string): number {
  const [j, m] = c.split("/").map(Number);
  return m * 100 + j;
}

const SELECT = "h-8 rounded-md border border-line bg-surface px-2 text-[12px] text-ink-2 hover:border-line-2";

export function CoprosVue({
  copros,
  etatInitial,
}: {
  copros: CoproPilotage[];
  etatInitial?: EtatCycle;
}) {
  const [vue, setVue] = useState<"liste" | "pipeline">(etatInitial ? "liste" : "pipeline");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "crypto" | "estale">("all");
  const [etat, setEtat] = useState<"all" | EtatCycle>(etatInitial ?? "all");
  const [cloture, setCloture] = useState("");

  const clotures = useMemo(
    () =>
      Array.from(new Set(copros.map((c) => c.exerciceCloture).filter((x): x is string => Boolean(x)))).sort(
        (a, b) => rangCloture(a) - rangCloture(b),
      ),
    [copros],
  );

  const filtrees = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return copros.filter((c) => {
      if (source !== "all" && c.source !== source) return false;
      if (etat !== "all" && c.etat !== etat) return false;
      if (cloture && c.exerciceCloture !== cloture) return false;
      if (
        terme &&
        !(
          c.code.toLowerCase().includes(terme) ||
          c.nom.toLowerCase().includes(terme) ||
          c.ville.toLowerCase().includes(terme)
        )
      )
        return false;
      return true;
    });
  }, [copros, q, source, etat, cloture]);

  const parEtat = useMemo(() => {
    const m: Record<EtatCycle, CoproPilotage[]> = {
      a_planifier: [],
      a_venir: [],
      en_preparation: [],
      convoquee: [],
      tenue: [],
    };
    for (const c of filtrees) m[c.etat].push(c);
    return m;
  }, [filtrees]);

  const filtre = source !== "all" || etat !== "all" || Boolean(cloture) || q.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (code, nom, ville)..."
            className="w-full h-8 pl-8 pr-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-green-700"
          />
        </div>
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)} className={SELECT}>
          <option value="all">Toutes les sources</option>
          <option value="estale">Estale</option>
          <option value="crypto">Crypto</option>
        </select>
        <select value={etat} onChange={(e) => setEtat(e.target.value as typeof etat)} className={SELECT}>
          <option value="all">Tous les états</option>
          {ETAT_CYCLE_ORDRE.map((e) => (
            <option key={e} value={e}>
              {ETAT_CYCLE_LABEL[e]}
            </option>
          ))}
        </select>
        {clotures.length > 1 && (
          <select value={cloture} onChange={(e) => setCloture(e.target.value)} className={SELECT}>
            <option value="">Tout exercice</option>
            {clotures.map((c) => (
              <option key={c} value={c}>
                Clôt. {c}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-0.5 bg-surface-2 rounded-md p-0.5">
          <BoutonVue actif={vue === "liste"} onClick={() => setVue("liste")} label="Liste" icone={List} />
          <BoutonVue actif={vue === "pipeline"} onClick={() => setVue("pipeline")} label="Pipeline" icone={LayoutGrid} />
        </div>
      </div>

      <p className="text-[12px] text-ink-3">
        {filtrees.length} copropriété{filtrees.length > 1 ? "s" : ""}
        {filtre ? ` sur ${copros.length}` : ""}
      </p>

      {vue === "liste" ? <VueListe copros={filtrees} /> : <VuePipeline parEtat={parEtat} />}
    </div>
  );
}

function BoutonVue({
  actif,
  onClick,
  label,
  icone: Icone,
}: {
  actif: boolean;
  onClick: () => void;
  label: string;
  icone: typeof List;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      title={label}
      className={cn(
        "inline-flex items-center gap-1 h-7 px-2.5 rounded-[5px] text-[12px] font-medium transition-colors duration-75",
        actif ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink-2",
      )}
    >
      <Icone strokeWidth={1.5} className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function VueListe({ copros }: { copros: CoproPilotage[] }) {
  if (copros.length === 0) {
    return (
      <Card>
        <p className="px-4 py-8 text-[13px] text-ink-3 text-center">Aucune copropriété ne correspond aux filtres.</p>
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-line">
        {copros.map((c) => (
          <li key={c.code}>
            <Link
              href={`/copropriete/${c.code}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
            >
              <Badge ton="outline" className="font-mono shrink-0">{c.code}</Badge>
              <span className="text-[13px] font-medium text-ink flex-1 truncate min-w-0">{c.nom}</span>
              <span className="text-[12px] text-ink-3 hidden md:block w-[110px] truncate">{c.ville}</span>
              <Badge ton={c.etat === "a_planifier" && c.enRetard ? "err" : ETAT_TON[c.etat]} dot className="shrink-0 w-[120px] justify-center hidden sm:inline-flex">
                {ETAT_CYCLE_LABEL[c.etat]}
              </Badge>
              <span className="text-[12px] text-ink-2 shrink-0 w-[90px] text-right font-mono">{echeance(c)}</span>
              <Badge ton={c.source === "estale" ? "info" : "neutral"} className="shrink-0 hidden lg:inline-flex">
                {libelleSource(c.source)}
              </Badge>
              <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function VuePipeline({ parEtat }: { parEtat: Record<EtatCycle, CoproPilotage[]> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {ETAT_CYCLE_ORDRE.map((etat) => (
        <div key={etat} className="flex flex-col">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-[12px] font-semibold text-ink">{ETAT_CYCLE_LABEL[etat]}</span>
            <span className="text-[11px] font-mono text-ink-3">{parEtat[etat].length}</span>
          </div>
          <div className="flex flex-col gap-2">
            {parEtat[etat].length === 0 ? (
              <p className="text-[11.5px] text-ink-4 px-1 py-3">Aucune copro.</p>
            ) : (
              parEtat[etat].map((c) => (
                <Link
                  key={c.code}
                  href={`/copropriete/${c.code}`}
                  className="block rounded-md border border-line bg-surface px-3 py-2.5 hover:border-line-2 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-ink-2 shrink-0">{c.code}</span>
                    <span className="text-[12.5px] font-medium text-ink truncate min-w-0">{c.nom}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-[11px] font-mono",
                        c.etat === "a_planifier" && c.enRetard ? "text-err-700 font-medium" : "text-ink-3",
                      )}
                    >
                      {echeance(c)}
                    </span>
                    <Badge ton={c.source === "estale" ? "info" : "neutral"} className="shrink-0 text-[10px]">
                      {libelleSource(c.source)}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
