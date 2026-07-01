// Nouvelle reprise : upload des PDF du syndic sortant -> extraction -> recap GO/STOP ->
// production des .xlsx d'import eStale. Server component (force-dynamic) ; le parcours
// interactif vit dans le composant client NouvelleReprise. Runtime nodejs (exceljs).

import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { NouvelleReprise } from "./nouvelle-reprise";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function NouvelleReprisePage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Nouvelle reprise</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[640px]">
          Importe les documents du syndic sortant (EDD/RCP, feuille de presence, PV). L&apos;outil extrait le
          patrimoine, applique les controles automatiques, presente un recapitulatif, puis produit les fichiers
          .xlsx a importer dans eStale. Rien n&apos;est produit sans validation.
        </p>
      </div>

      <NouvelleReprise />
    </div>
  );
}
