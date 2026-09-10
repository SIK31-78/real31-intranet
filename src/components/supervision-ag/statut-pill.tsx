import { Badge, type BadgeTon } from "@/components/ui/badge";
import type { StatutItem } from "@/lib/domain/supervision-ag";

const LIBELLES: Record<StatutItem, string> = {
  ok: "OK",
  probleme: "Problème",
  non_applicable: "N/A",
  non_verifie: "À vérifier",
};

const TONS: Record<StatutItem, BadgeTon> = {
  ok: "ok",
  probleme: "err",
  non_applicable: "neutral",
  non_verifie: "outline",
};

export function StatutPill({ statut }: { statut: StatutItem }) {
  return <Badge ton={TONS[statut]}>{LIBELLES[statut]}</Badge>;
}

export const STATUT_LIBELLES = LIBELLES;
