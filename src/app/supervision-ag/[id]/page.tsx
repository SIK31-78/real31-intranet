import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";
import { getCycleAgDeSupervision } from "@/lib/services/supervision-ag/get-cycle-ag";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { SupervisionVue } from "@/components/supervision-ag/supervision-vue";
import { creneauCsDeLaCopro } from "@/lib/services/coproprietes/creneau-cs";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
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

  // Frise du fil d'AG (S1 refonte) : cycle AG courant de la copro, calcule par LA
  // source unique (domain/cycle-ag). null (copro introuvable) = pas de frise, le
  // reste de l'ecran garde son comportement actuel.
  const cycle = await getCycleAgDeSupervision(id, aujourdhuiISO, g.id, supervision.statut);

  // MVP : EL est gestionnaire de la copro courante. Permissions UI-only.
  const role = "gestionnaire" as const;

  // Creneau REEL du CS preparatoire, pour pre-remplir la facturation des honoraires CS
  // ouverte depuis la checklist (demande Sekou 2026-07-28). Le jour et l'heure de debut
  // viennent du referentiel ; l'heure de FIN est celle saisie a la confirmation du CS.
  // Tout est facultatif : sans confirmation, le formulaire garde ses valeurs par defaut.
  const creneauCsSuggere = await creneauCsDeLaCopro(supervision.copro.code, g.id);

  return (
    <AppShell
      user={g}
      active="aucun"
      breadcrumb={`Supervision AG · ${supervision.copro.nomCourt}`}
    >
      <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <SupervisionVue
          supervision={supervision}
          cycle={cycle}
          role={role}
          aujourdhuiISO={aujourdhuiISO}
          pennylaneMode={modeEmissionFacture(process.env.PENNYLANE_API_KEY, process.env.PENNYLANE_FACTURE_VALIDEE)}
          {...(creneauCsSuggere ? { creneauCsSuggere } : {})}
          onCocher={cocherItemAction.bind(null, id)}
          onCommenter={commenterItemAction.bind(null, id)}
          onConclure={conclureAgAction.bind(null, id)}
        />
      </div>
    </AppShell>
  );
}
