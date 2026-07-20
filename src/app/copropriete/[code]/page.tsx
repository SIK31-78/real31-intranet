import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getFicheCopro } from "@/lib/services/fiche-copro/get-fiche-copro";
import { getDossiersCopro } from "@/lib/services/dossiers/get-dossiers";
import { etatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { peutVoirComptabilite } from "@/lib/auth/roles";
import { AppShell } from "@/components/layout/app-shell";
import { FicheCoproVue } from "@/components/fiche-copro/fiche-copro-vue";

export const metadata: Metadata = {
  title: "Fiche copropriété - REAL31 Intranet",
};

export default async function CoproprietePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  // Le pole comptable (COMPTABLES) et les super-admins ouvrent la fiche de N'IMPORTE
  // quelle copro (lecture transverse) : ils ne sont pas cloisonnes par managerId. Un
  // gestionnaire normal reste cloisonne a son portefeuille (transverse = false -> 404
  // hors perimetre). Ce role sert aussi a activer le POLE COMPTA de la fiche pour eux.
  const transverse = peutVoirComptabilite(g.email, g.role);
  const fiche = await getFicheCopro(code, g.id, aujourdhuiISO, { transverse });
  if (!fiche) notFound();
  const dossiers = await getDossiersCopro(code, g.id);
  // Gating mail : double gate (MAIL_SOURCE=graph + allowlist pilotes) applique au bouton
  // "Preparer le mail au CS/AG" -> grise pour les non-pilotes (comme Mes emails).
  const mailActif = mailModuleActifPour(g.email);
  // Etat de la liste de diffusion CS (secours) : source active du mail (eStale vs secours)
  // + adresses de secours editables. L'appel eStale est un hit de cache (deja lu par la
  // fiche). On degrade en secours vide si la lecture echoue (l'ecran ne casse pas).
  const listeSecoursCS = await etatListeSecoursCS(code).catch(() => ({
    sourceActive: "aucune" as const,
    estaleFournitEmails: false,
    emailsSecours: [] as string[],
  }));

  return (
    <AppShell
      user={g}
      active="copros"
      breadcrumb={`Copropriétés · ${fiche.copro.code}`}
    >
      <div className="mx-auto max-w-[1100px] px-8 py-8">
        <FicheCoproVue
          fiche={fiche}
          dossiers={dossiers}
          mailActif={mailActif}
          estComptable={transverse}
          listeSecoursCS={listeSecoursCS}
        />
      </div>
    </AppShell>
  );
}
