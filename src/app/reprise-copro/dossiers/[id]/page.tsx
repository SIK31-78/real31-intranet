// Fiche detaillee d'un dossier de reprise. Server component (force-dynamic) : lit le repo
// memoire via le service suivi (par ref, qui sert d'id d'URL), projette une vue
// serialisable, delegue l'affichage au composant client. 404 propre si le dossier
// n'existe pas.

import { notFound, redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getRepriseDossierRepository } from "@/lib/reprise/adapters/router";
import { obtenirDossier } from "@/lib/reprise/services/suivi-dossier";
import { avancement } from "@/lib/reprise/domain/dossier";
import { FicheDossierReprise, type DossierFicheVue } from "./fiche-dossier-reprise";

export const dynamic = "force-dynamic";

export default async function FicheDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const { id } = await params;
  const dossier = await obtenirDossier(getRepriseDossierRepository(), decodeURIComponent(id));
  if (!dossier) notFound();

  const faites = dossier.etapes.filter((e) => e.statut === "fait" || e.statut === "ignore").length;
  const vue: DossierFicheVue = {
    ref: dossier.ref,
    nomUsuel: dossier.nomUsuel,
    statut: dossier.statut,
    avancement: avancement(dossier),
    etapesFaites: faites,
    etapesTotal: dossier.etapes.length,
    etapes: dossier.etapes.map((e) => ({
      code: e.code,
      phase: e.phase,
      libelle: e.libelle,
      statut: e.statut,
    })),
    anomalies: dossier.anomalies,
    journal: dossier.journal.map((j) => ({ date: j.date, texte: j.texte })),
  };

  return (
    <div className="flex flex-col gap-6">
      <FicheDossierReprise dossier={vue} />

      <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
        Etat non persistant (memoire) : ce dossier est perdu au redemarrage du serveur. La persistance
        Supabase arrivera plus tard, sans changer cet ecran.
      </p>
    </div>
  );
}
