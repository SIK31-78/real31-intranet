import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";
import { AppShell } from "@/components/layout/app-shell";
import { SupervisionVue } from "@/components/supervision-ag/supervision-vue";
import {
  cocherItemAction,
  commenterItemAction,
  conclureAgAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Supervision AG — REAL31 Intranet",
};

// Mock session : meme ancre que les autres ecrans (cf. dashboard, calendrier).
const GESTIONNAIRE = { id: "el", nomComplet: "Élise Lambert", initiales: "EL" };
const AUJOURDHUI_ISO = "2026-05-27";

export default async function SupervisionAgPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supervision = await getSupervisionAg(id);
  if (!supervision) notFound();

  // MVP : EL est gestionnaire de la copro courante. Permissions UI-only.
  const role = "gestionnaire" as const;

  return (
    <AppShell
      user={GESTIONNAIRE}
      active="calendrier"
      breadcrumb={`Supervision AG · ${supervision.copro.nomCourt}`}
    >
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <SupervisionVue
          supervision={supervision}
          role={role}
          aujourdhuiISO={AUJOURDHUI_ISO}
          onCocher={cocherItemAction.bind(null, id)}
          onCommenter={commenterItemAction.bind(null, id)}
          onConclure={conclureAgAction.bind(null, id)}
        />
      </div>
    </AppShell>
  );
}
