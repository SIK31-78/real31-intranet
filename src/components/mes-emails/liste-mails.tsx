"use client";

import { Search, Building2 } from "lucide-react";
import type { MailEntrant } from "@/lib/domain/mes-emails";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { StatutBadge } from "./statut-badge";
import { jourMois, type Statut, type VueBoite } from "./mes-emails.utils";

// Volet gauche de « Mes e-mails » : les vues (Reçus / Traités / Tous), les sous-dossiers
// par copropriété, la recherche et la liste des mails. Aucun état propre : tout vient de
// l'orchestrateur (mes-emails-vue).
export function ListeMails({
  vue,
  onChangerVue,
  dossiersVue,
  copros,
  filtreCopro,
  onFiltrerCopro,
  countCopro,
  countCoproNonLus,
  recherche,
  onRecherche,
  visibles,
  selectionId,
  lus,
  statutDe,
  onOuvrir,
}: {
  vue: VueBoite;
  onChangerVue: (vue: VueBoite) => void;
  dossiersVue: readonly { cle: VueBoite; label: string; n: number }[];
  copros: { code: string; nom: string }[];
  filtreCopro: string;
  onFiltrerCopro: (code: string) => void;
  countCopro: (code: string | null) => number;
  countCoproNonLus: (code: string | null) => number;
  recherche: string;
  onRecherche: (q: string) => void;
  visibles: MailEntrant[];
  selectionId: string | undefined;
  lus: Set<string>;
  statutDe: (id: string) => Statut;
  onOuvrir: (id: string) => void;
}) {
  return (
    <aside className="w-full lg:w-[300px] shrink-0 flex flex-col gap-2.5">
      {/* Dossiers (vues) : Reçus / Traités / Tous */}
      <div className="flex items-center gap-1">
        {dossiersVue.map((d) => (
          <button
            key={d.cle}
            type="button"
            onClick={() => onChangerVue(d.cle)}
            className={
              "flex-1 h-8 rounded-md text-body border transition-colors inline-flex items-center justify-center gap-1.5 " +
              (vue === d.cle
                ? "bg-green-50 text-green-700 border-green-500/30 font-medium"
                : "bg-surface text-ink-2 border-line hover:bg-surface-2")
            }
          >
            {d.label}
            <span className={vue === d.cle ? "text-green-700/70" : "text-ink-3"}>{d.n}</span>
          </button>
        ))}
      </div>

      {/* Sous-dossiers par copropriété */}
      <div className="flex flex-col gap-0.5">
        <p className="px-2 pt-1 pb-0.5 text-meta font-medium uppercase tracking-[0.06em] text-ink-3">
          Copropriétés
        </p>
        <CoproFolder
          actif={filtreCopro === "toutes"}
          label="Toutes les copropriétés"
          n={countCopro(null)}
          nonLus={countCoproNonLus(null)}
          onClick={() => onFiltrerCopro("toutes")}
        />
        {copros.map((c) => (
          <CoproFolder
            key={c.code}
            actif={filtreCopro === c.code}
            label={`${c.code} · ${c.nom}`}
            n={countCopro(c.code)}
            nonLus={countCoproNonLus(c.code)}
            onClick={() => onFiltrerCopro(c.code)}
          />
        ))}
      </div>

      <div className="relative">
        <Search
          strokeWidth={1.5}
          className="w-3.5 h-3.5 text-ink-3 absolute left-2.5 top-1/2 -translate-y-1/2"
        />
        <Input
          type="text"
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          placeholder="Rechercher..."

        />
      </div>

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line max-h-[calc(100vh-300px)] overflow-auto">
          {visibles.map((m) => (
            <BoiteItem
              key={m.id}
              m={m}
              actif={m.id === selectionId}
              lu={lus.has(m.id)}
              statut={statutDe(m.id)}
              onClick={() => onOuvrir(m.id)}
            />
          ))}
          {visibles.length === 0 && (
            <li className="px-4 py-6 text-center text-body text-ink-3">Aucun mail.</li>
          )}
        </ul>
      </Card>
    </aside>
  );
}

function CoproFolder({
  actif,
  label,
  n,
  nonLus,
  onClick,
}: {
  actif: boolean;
  label: string;
  n: number;
  nonLus: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-body text-left transition-colors " +
        (actif ? "bg-green-50 text-green-700 font-medium" : "text-ink-2 hover:bg-surface-2")
      }
    >
      <Building2
        strokeWidth={1.5}
        className={"w-3.5 h-3.5 shrink-0 " + (actif ? "text-green-700" : "text-ink-3")}
      />
      <span className={"truncate flex-1 " + (nonLus > 0 ? "font-semibold text-ink" : "")}>{label}</span>
      {nonLus > 0 ? (
        <span className="text-info-700 font-semibold text-meta">{nonLus}</span>
      ) : (
        <span className="text-ink-3 text-meta">{n}</span>
      )}
    </button>
  );
}

function BoiteItem({
  m,
  actif,
  lu,
  statut,
  onClick,
}: {
  m: MailEntrant;
  actif: boolean;
  lu: boolean;
  statut: Statut;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={
          "w-full text-left px-3.5 py-3 transition-colors " +
          (actif ? "bg-green-50" : "hover:bg-surface-2") +
          (statut === "classe" ? " opacity-55" : "")
        }
      >
        <div className="flex items-center gap-2">
          {/* Indicateur neutre lu/non-lu (plus d'urgence IA). */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${!lu ? "bg-info-500" : "bg-transparent"}`} />
          <span
            className={
              "text-body text-ink truncate flex-1 " +
              (statut === "classe" ? "line-through " : "") +
              (!lu ? "font-semibold" : "font-medium")
            }
          >
            {m.objet}
          </span>
          {statut !== "nouveau" ? <StatutBadge statut={statut} /> : null}
        </div>
        <div className="flex items-center gap-1.5 mt-1 pl-4 text-meta text-ink-3">
          <Building2 strokeWidth={1.5} className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {m.coproNom} · {m.de.replace(/ \(.*\)$/, "")}
          </span>
          <span className="ml-auto shrink-0">{jourMois(m.date)}</span>
        </div>
        <p className="mt-0.5 pl-4 text-meta text-ink-3 truncate">
          {m.corps.replace(/\s+/g, " ").trim()}
        </p>
      </button>
    </li>
  );
}
