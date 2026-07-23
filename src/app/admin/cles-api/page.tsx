// Panneau d'administration des CLES API MACHINE (auth de /api/v1 + serveur MCP).
// RESERVE SUPER-ADMIN : garde serveur ici (redirect) + garde dans chaque action.
// Degradation propre : table intranet_api_keys absente -> bandeau "SQL a passer",
// jamais un crash.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ClesApiVue } from "@/components/admin/cles-api-vue";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { listerClesApi } from "@/lib/auth/cle-api";
import { ApiNonConfigureeError, type CleApi } from "@/lib/domain/cle-api";
import { getGestionnaireRepository } from "@/lib/adapters/router";

export const metadata: Metadata = { title: "Clés API - REAL31 Intranet" };

export const dynamic = "force-dynamic";

export default async function ClesApiPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estSuperAdmin(g.email)) redirect("/accueil");

  let cles: CleApi[] = [];
  let apiNonConfiguree = false;
  try {
    cles = await listerClesApi();
  } catch (e) {
    if (e instanceof ApiNonConfigureeError) apiNonConfiguree = true;
    else throw e;
  }

  // Liaison optionnelle d'une cle a un gestionnaire (cloisonnement machine).
  const gestionnaires = (await getGestionnaireRepository().list()).map((x) => ({
    id: x.id,
    nom: x.nomComplet,
  }));

  return (
    <AppShell user={g} active="cles-api" breadcrumb="Administration / Clés API">
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <h1 className="text-[20px] font-medium tracking-tight text-ink mb-1">Clés API</h1>
        <p className="text-[13px] text-ink-3 mb-4">
          Accès machine à l&apos;intranet (API /api/v1 et serveur MCP). La clé n&apos;est affichée
          qu&apos;une seule fois, à la création — seul son empreinte (hash) est conservée.
        </p>
        <ClesApiVue cles={cles} gestionnaires={gestionnaires} apiNonConfiguree={apiNonConfiguree} />
      </div>
    </AppShell>
  );
}
