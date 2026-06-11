import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { SupervisionVue } from "@/components/supervision-ag/supervision-vue";
import {
  cocherItemAction,
  commenterItemAction,
  conclureAgAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Supervision AG - REAL31 Intranet",
};

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function SupervisionAgPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const supervision = await getSupervisionAg(id, g.id);
  if (!supervision) notFound();

  // MVP : EL est gestionnaire de la copro courante. Permissions UI-only.
  const role = "gestionnaire" as const;

  return (
    <AppShell
      user={g}
      active="calendrier"
      breadcrumb={`Supervision AG · ${supervision.copro.nomCourt}`}
    >
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <SupervisionVue
          supervision={supervision}
          role={role}
          aujourdhuiISO={aujourdhuiISO}
          onCocher={cocherItemAction.bind(null, id)}
          onCommenter={commenterItemAction.bind(null, id)}
          onConclure={conclureAgAction.bind(null, id)}
        />
      </div>
    </AppShell>
  );
}
