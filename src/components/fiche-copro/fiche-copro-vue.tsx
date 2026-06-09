"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FicheCopro } from "@/lib/domain/copropriete";
import { CoproHeader } from "./copro-header";
import { FicheVueEnsemble } from "./fiche-vue-ensemble";
import { FicheEvenements } from "./fiche-evenements";

type Onglet = "ensemble" | "evenements";

// Onglets verrouilles : modules a venir (Contrats, Sinistres...). Grises, non cliquables
// (cf. mockup + ADR-021 : MVP strict, ces modules sont post-MVP).
const VERROUILLES = ["Contrats", "Sinistres", "Comptabilité", "Documents"];

export function FicheCoproVue({ fiche }: { fiche: FicheCopro }) {
  const [onglet, setOnglet] = useState<Onglet>("ensemble");

  return (
    <div className="flex flex-col gap-5">
      <CoproHeader copro={fiche.copro} />

      <div className="flex items-center gap-1 border-b border-line overflow-x-auto">
        <Tab active={onglet === "ensemble"} onClick={() => setOnglet("ensemble")}>
          Vue d&apos;ensemble
        </Tab>
        <Tab
          active={onglet === "evenements"}
          onClick={() => setOnglet("evenements")}
          count={fiche.prochains.length}
        >
          Événements
        </Tab>
        {VERROUILLES.map((label) => (
          <span
            key={label}
            title="Disponible dans un prochain module"
            className="inline-flex items-center gap-1 px-3 py-2 text-[13px] text-ink-3 opacity-60 cursor-not-allowed whitespace-nowrap"
          >
            <Lock strokeWidth={1.5} className="w-3 h-3" />
            {label}
          </span>
        ))}
      </div>

      {onglet === "ensemble" ? (
        <FicheVueEnsemble fiche={fiche} />
      ) : (
        <FicheEvenements evenements={fiche.prochains} />
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors whitespace-nowrap",
        active
          ? "border-green-500 text-ink font-medium"
          : "border-transparent text-ink-2 hover:text-ink",
      )}
    >
      {children}
      {count !== undefined && (
        <span className="font-mono text-[11px] text-ink-3">{count}</span>
      )}
    </button>
  );
}
