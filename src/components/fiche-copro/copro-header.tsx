import { Building2, MapPin, ExternalLink } from "lucide-react";
import type { Copropriete } from "@/lib/domain/copropriete";
import { libelleSource } from "@/lib/domain/copropriete";
import { Badge } from "@/components/ui/badge";

// En-tete de la fiche copro. Le bouton "Ouvrir dans Estale" n'apparait que pour les
// copros sourcees Estale : Crypto n'est pas deep-linkable (ADR-012).
export function CoproHeader({ copro }: { copro: Copropriete }) {
  const rue = [copro.adresse.ligne1, copro.adresse.ligne2].filter(Boolean).join(", ");
  return (
    <div className="bg-surface border border-line rounded-md p-5 flex items-start gap-4">
      <div className="w-14 h-14 rounded-md bg-surface-2 flex items-center justify-center shrink-0">
        <Building2 strokeWidth={1.5} className="w-7 h-7 text-ink-3" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge ton="outline" className="font-mono">{copro.code}</Badge>
          <Badge ton={copro.source === "estale" ? "info" : "neutral"}>
            Source : {libelleSource(copro.source)}
          </Badge>
        </div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">{copro.nom}</h1>
        <p className="mt-1 text-[13px] text-ink-3 flex items-center gap-1.5">
          <MapPin strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
          <span>
            {rue} · {copro.adresse.codePostal} {copro.adresse.ville}
          </span>
        </p>
      </div>

      {copro.source === "estale" && copro.estaleDeepLink && (
        <a
          href={copro.estaleDeepLink}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] text-ink hover:bg-surface-2 transition-colors"
        >
          <ExternalLink strokeWidth={1.5} className="w-3.5 h-3.5" />
          Ouvrir dans Estale
        </a>
      )}
    </div>
  );
}
