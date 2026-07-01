// Fiche-HUB d'un dossier de reprise. Server component (force-dynamic) : lit le repo
// memoire via le service suivi, projette une vue serialisable (en-tete + compteurs
// patrimoine deja reportes + etapes de suivi humain + journal), delegue l'affichage +
// le pilotage IA au composant client. 404 propre si le dossier n'existe pas.

import { notFound, redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getRepriseDossierRepository, modeExtraction, reprisePersistanceSupabase } from "@/lib/reprise/adapters/router";
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

  // Les compteurs patrimoine ne sont renseignes qu'apres une premiere analyse.
  const c = dossier.compteurs;
  const analyseFaite =
    c.nbLots !== undefined ||
    c.nbCles !== undefined ||
    c.nbCoproprietaires !== undefined ||
    c.nbAttributions !== undefined;

  const vue: DossierFicheVue = {
    ref: dossier.ref,
    nomUsuel: dossier.nomUsuel,
    adresse: dossier.adresse,
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
    patrimoine: {
      analyseFaite,
      nbLots: c.nbLots ?? 0,
      nbCles: c.nbCles ?? 0,
      nbCoproprietaires: c.nbCoproprietaires ?? 0,
      nbAttributions: c.nbAttributions ?? 0,
      nbAnomalies: c.nbAnomalies ?? 0,
    },
    journal: dossier.journal.map((j) => ({ date: j.date, texte: j.texte })),
  };

  const modeIa = modeExtraction();
  const persistant = reprisePersistanceSupabase();

  return (
    <div className="flex flex-col gap-6">
      <FicheDossierReprise dossier={vue} modeIa={modeIa} />

      <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
        {!persistant && (
          <>
            Etat non persistant (memoire) : ce dossier est perdu au redemarrage du serveur. La persistance
            Supabase s&apos;active avec COPRO_SOURCE=supabase, sans changer cet ecran.{" "}
          </>
        )}
        L&apos;injection eStale est en mode DRY-RUN (aucune ecriture reelle).
      </p>
    </div>
  );
}
