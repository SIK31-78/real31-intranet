// Badge de majorite d'une resolution (art. de la loi de 1965), couleur par type.
// Mutualise entre la bibliotheque et le mode CS.

import { Badge } from "@/components/ui/badge";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import { MAJORITE_LABEL } from "@/lib/domain/resolution";

const TON: Record<MajoriteResolution, "ok" | "warn" | "info" | "neutral" | "brand"> = {
  A24: "info",
  A25: "warn",
  A25_1: "warn",
  A26: "brand",
  A26_1: "brand",
  UNANIMITY: "neutral",
  QUESTION: "neutral",
};

export function MajoriteBadge({ majorite }: { majorite: MajoriteResolution }) {
  return (
    <Badge ton={TON[majorite]} className="shrink-0">
      {MAJORITE_LABEL[majorite]}
    </Badge>
  );
}
