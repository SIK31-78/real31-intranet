import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSupervisionAg } from "@/lib/services/supervision-ag/get-supervision-ag";
import { getCycleAgDeSupervision } from "@/lib/services/supervision-ag/get-cycle-ag";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { AppShell } from "@/components/layout/app-shell";
import { SupervisionVue } from "@/components/supervision-ag/supervision-vue";
import { Page } from "@/components/ui/page";
import { creneauCsDeLaCopro } from "@/lib/services/coproprietes/creneau-cs";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import {
  cocherItemAction,
  commenterItemAction,
  conclureAgAction,
} from "./actions";
import { apercuAnnonceAgAction, creerAnnonceAgAction } from "./annonce-ag-actions";
import { annonceAgPossible } from "@/lib/services/estale/annonce-ag-mailing";

import { ancreDuJour } from "@/lib/services/date-du-jour";
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
  const aujourdhuiISO = ancreDuJour();
  // Autorite = le perimetre ADR-041 (portefeuille, role, delegations, perimetre comptable),
  // comme les actions de cette page. Les lectures ci-dessous ne refont donc PAS le
  // cloisonnement gestionnaire/assistant : un admin ou un delegue tombait sur une 404.
  const code = id.split("__")[0] ?? "";
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(code, g.id))) notFound();
  const supervision = await getSupervisionAg(id);
  if (!supervision) notFound();

  // Frise du fil d'AG (S1 refonte) : cycle AG courant de la copro, calcule par LA
  // source unique (domain/cycle-ag). null (copro introuvable) = pas de frise, le
  // reste de l'ecran garde son comportement actuel.
  const cycle = await getCycleAgDeSupervision(id, aujourdhuiISO, undefined, supervision.statut);

  // MVP : EL est gestionnaire de la copro courante. Permissions UI-only.
  const role = "gestionnaire" as const;

  // Creneau REEL du CS preparatoire, pour pre-remplir la facturation des honoraires CS
  // ouverte depuis la checklist (demande Sekou 2026-07-28). Le jour et l'heure de debut
  // viennent du referentiel ; l'heure de FIN est celle saisie a la confirmation du CS.
  // Tout est facultatif : sans confirmation, le formulaire garde ses valeurs par defaut.
  const creneauCsSuggere = await creneauCsDeLaCopro(supervision.copro.code);

  // Annonce de l'AG par mailing ESTALE (REA-144), ouverte depuis l'item avcs.annonce-ag :
  // actions pour une copro ESTALE seulement (Crypto : le module explique, cochage à la main).
  const annonceEstale = (await annonceAgPossible(supervision.copro.code))
    ? { apercu: apercuAnnonceAgAction.bind(null, id), creer: creerAnnonceAgAction.bind(null, id) }
    : undefined;

  return (
    <AppShell
      user={g}
      active="aucun"
      breadcrumb={`Supervision AG · ${supervision.copro.nomCourt}`}
    >
      <Page largeur="travail">
        <SupervisionVue
          supervision={supervision}
          cycle={cycle}
          role={role}
          aujourdhuiISO={aujourdhuiISO}
          pennylaneMode={modeEmissionFacture(process.env.PENNYLANE_API_KEY, process.env.PENNYLANE_FACTURE_VALIDEE)}
          {...(creneauCsSuggere ? { creneauCsSuggere } : {})}
          {...(annonceEstale ? { annonceEstale } : {})}
          onCocher={cocherItemAction.bind(null, id)}
          onCommenter={commenterItemAction.bind(null, id)}
          onConclure={conclureAgAction.bind(null, id)}
        />
      </Page>
    </AppShell>
  );
}
