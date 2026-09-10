import { ExternalLink, MapPin } from "lucide-react";
import type { Copropriete } from "@/lib/domain/copropriete";
import { libelleSource } from "@/lib/domain/copropriete";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page";
import { ButtonAnchor } from "@/components/ui/button";

// En-tete de la fiche copro : code, source, nom, adresse - sur deux lignes, sans carte.
// Le bouton "Ouvrir dans ESTALE" n'apparait que pour les copros sourcees ESTALE :
// Crypto n'est pas deep-linkable (ADR-012).
export function CoproHeader({ copro }: { copro: Copropriete }) {
  const rue = [copro.adresse.ligne1, copro.adresse.ligne2].filter(Boolean).join(", ");
  return (
    <PageHeader
      titre={copro.nom}
      code={copro.code}
      badge={
        <Badge ton={copro.source === "estale" ? "info" : "neutral"}>
          Source : {libelleSource(copro.source)}
        </Badge>
      }
      meta={
        <span className="inline-flex items-center gap-1.5">
          <MapPin strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
          {rue} · {copro.adresse.codePostal} {copro.adresse.ville}
        </span>
      }
      actions={
        copro.source === "estale" && copro.estaleDeepLink ? (
          <ButtonAnchor href={copro.estaleDeepLink} target="_blank" rel="noreferrer" variant="secondary">
            <ExternalLink strokeWidth={1.5} />
            Ouvrir dans ESTALE
          </ButtonAnchor>
        ) : undefined
      }
    />
  );
}
