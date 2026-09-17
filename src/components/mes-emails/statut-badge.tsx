"use client";

import { Badge } from "@/components/ui/badge";
import type { Statut } from "./mes-emails.utils";

export function StatutBadge({ statut }: { statut: Statut }) {
  if (statut === "classe") return <Badge ton="ok">Classé</Badge>;
  if (statut === "repondu") return <Badge ton="info">Répondu</Badge>;
  return null;
}
