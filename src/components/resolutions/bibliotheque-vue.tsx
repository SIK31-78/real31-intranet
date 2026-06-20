"use client";

// Vue lecture seule de la bibliotheque de resolutions (motion bank Estale, ADR-024).
// Recherche par mot-cle + filtre par majorite. C'est le futur "picker" du mode CS.

import { useMemo, useState } from "react";
import { Search, AlertTriangle, Library } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MajoriteResolution, Resolution } from "@/lib/domain/resolution";
import { MAJORITE_LABEL, MAJORITE_ORDRE } from "@/lib/domain/resolution";
import { MajoriteBadge } from "@/components/resolutions/majorite-badge";
import type { BibliothequeData } from "@/lib/services/resolutions/get-bibliotheque";

export function BibliothequeVue({ data }: { data: BibliothequeData }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<MajoriteResolution | "all">("all");

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return data.resolutions.filter((r) => {
      if (filtre !== "all" && r.majorite !== filtre) return false;
      if (!terme) return true;
      return (
        r.titre.toLowerCase().includes(terme) ||
        r.corps.toLowerCase().includes(terme) ||
        r.motsCles.some((m) => m.toLowerCase().includes(terme))
      );
    });
  }, [data.resolutions, q, filtre]);

  const parMajorite = useMemo(() => {
    const m = new Map<MajoriteResolution, number>();
    for (const r of data.resolutions) m.set(r.majorite, (m.get(r.majorite) ?? 0) + 1);
    return m;
  }, [data.resolutions]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[20px] font-semibold text-ink flex items-center gap-2">
          <Library strokeWidth={1.5} className="w-5 h-5 text-green-700" />
          Bibliothèque de résolutions
        </h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Modèles de résolutions du cabinet, depuis Estale. Lecture seule pour l&apos;instant -
          serviront à composer l&apos;ordre du jour des AG.
        </p>
      </div>

      {data.indisponible ? (
        <Card>
          <div className="flex items-start gap-2.5 px-4 py-6">
            <AlertTriangle strokeWidth={1.5} className="w-4 h-4 text-warn-700 shrink-0 mt-px" />
            <p className="text-[13px] text-warn-700">
              Bibliothèque Estale temporairement indisponible (panne passagère). Rechargez la page
              dans un instant.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search
                strokeWidth={1.5}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3"
              />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une résolution (titre, mot-clé, texte)..."
                className="w-full h-9 pl-9 pr-3 rounded-md border border-line bg-surface text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-green-700"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filtrer par majorité">
              <Chip actif={filtre === "all"} onClick={() => setFiltre("all")}>
                Tout ({data.resolutions.length})
              </Chip>
              {MAJORITE_ORDRE.filter((m) => parMajorite.has(m)).map((m) => (
                <Chip key={m} actif={filtre === m} onClick={() => setFiltre(m)}>
                  {MAJORITE_LABEL[m]} ({parMajorite.get(m)})
                </Chip>
              ))}
            </div>
          </div>

          <p className="text-[12px] text-ink-3">
            {visibles.length} résolution{visibles.length > 1 ? "s" : ""}
            {filtre !== "all" || q ? ` sur ${data.resolutions.length}` : ""}
          </p>

          <div className="flex flex-col gap-2.5">
            {visibles.map((r) => (
              <ResolutionCard key={r.id} resolution={r} />
            ))}
            {visibles.length === 0 && (
              <p className="text-[13px] text-ink-3 px-1 py-6 text-center">
                Aucune résolution ne correspond à la recherche.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={actif}
      className={`h-7 px-2.5 rounded-full text-[12px] font-medium border transition-colors ${
        actif
          ? "bg-green-700 text-surface border-green-700"
          : "bg-surface text-ink-2 border-line hover:border-line-2"
      }`}
    >
      {children}
    </button>
  );
}

function ResolutionCard({ resolution }: { resolution: Resolution }) {
  return (
    <Card>
      <div className="px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="flex-1 text-[14px] font-medium text-ink">{resolution.titre}</span>
          <MajoriteBadge majorite={resolution.majorite} />
          {resolution.parDefaut && (
            <Badge ton="outline" className="shrink-0">
              standard
            </Badge>
          )}
        </div>
        {resolution.corps && (
          <p className="mt-1.5 text-[12.5px] text-ink-3 line-clamp-2">{resolution.corps}</p>
        )}
        {resolution.motsCles.length > 0 && (
          <div className="mt-2 flex items-center gap-1 flex-wrap">
            {resolution.motsCles.map((m) => (
              <span
                key={m}
                className="text-[11px] text-ink-3 bg-surface-2 rounded-sm px-1.5 py-0.5"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
