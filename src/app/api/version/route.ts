// Version en ligne de l'application (REA-312) : lue par le bandeau « nouvelle version »
// des onglets ouverts. Aucune donnée, juste l'identifiant du déploiement.

import { NextResponse } from "next/server";
import { versionDuBuild } from "@/lib/domain/version-app";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: versionDuBuild(process.env) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
