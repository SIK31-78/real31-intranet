// Fiche-HUB d'un dossier de reprise. Server component (force-dynamic) : lit le repo
// memoire via le service suivi, projette une vue serialisable (en-tete + compteurs
// patrimoine deja reportes + etapes de suivi humain + journal), delegue l'affichage +
// le pilotage IA au composant client. 404 propre si le dossier n'existe pas.

import { notFound, redirect } from "next/navigation";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import {
  getRepriseDossierRepository,
  getFicheRenseignementsRepository,
  modeExtraction,
  reprisePersistanceSupabase,
  ecritureEstaleReelle,
} from "@/lib/reprise/adapters/router";
import { obtenirDossier } from "@/lib/reprise/services/suivi-dossier";
import { calculerRecap } from "@/lib/reprise/services/orchestrateur-patrimoine";
import { avancement } from "@/lib/reprise/domain/dossier";
import { FicheDossierReprise, type DossierFicheVue, type AnalyseInitiale } from "./fiche-dossier-reprise";
import type { FicheOwnerVue } from "./fiche-renseignements-bloc";

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

  // Si le jeu est persiste, on rehydrate l'analyse cote client (recap recalcule depuis le
  // jeu) : la fiche affiche directement les resultats et injection/production marchent SANS
  // re-analyser. Les notes d'extraction (le gros bloc de vigilance) ne sont PAS dans le jeu,
  // mais ont ete persistees dans dossier.anomalies (appliquerRecap = notes + warnings). On les
  // y relit en retirant les warnings deterministes (recalcules par calculerRecap) pour ne pas
  // les afficher deux fois.
  let analyseInitiale: AnalyseInitiale | null = null;
  if (dossier.jeu) {
    const recap = calculerRecap(dossier.jeu);
    const warnings = new Set(recap.checks.warnings.map((w) => w.message));
    recap.notes = dossier.anomalies.filter((a) => !warnings.has(a));
    // Bloc compta : recalcule depuis le jeu (liaison) par calculerRecap ; le resume compta
    // (balance / nb comptes) n'est pas dans le jeu -> relu depuis les compteurs persistes.
    if (dossier.compteurs.compta) recap.compta = dossier.compteurs.compta;
    // Erreur d'extraction du grand livre (couche texte scannee) persistee -> rehydrate le bloc
    // compta en erreur a la reouverture, sans re-analyser.
    if (dossier.compteurs.comptaErreur) recap.comptaErreur = dossier.compteurs.comptaErreur;
    analyseInitiale = { jeu: dossier.jeu, recap };
  }

  const modeIa = modeExtraction();
  const persistant = reprisePersistanceSupabase();
  const ecritureReelle = ecritureEstaleReelle();
  const mailActif = mailModuleActifPour(g.email);

  // "Deja injecte" = trace d'une injection REELLE dans le journal (seul marqueur fiable : les
  // injections reelles reussies journalisent "Injection eStale REELLE ...", jamais les dry-runs).
  // Sert a avertir dans l'editeur que les corrections ne touchent QUE le jeu local, pas eStale.
  const dejaInjecte = dossier.journal.some((j) => j.texte.startsWith("Injection eStale REELLE"));

  // Fiches de renseignements : on joint les owners du jeu (nom) aux fiches persistees (statut,
  // dates, reponse). Un owner sans fiche apparait en statut "aucune" (courrier a generer).
  const owners = dossier.jeu?.owners ?? [];
  const fichesBrutes = await getFicheRenseignementsRepository().listerParDossier(dossier.ref);
  const parOwner = new Map(fichesBrutes.map((f) => [f.ownerId, f]));
  const fichesVue: FicheOwnerVue[] = owners.map((o) => {
    const nom = [o.civilite, o.nom, o.prenom].filter(Boolean).join(" ").trim() || o.id;
    const f = parOwner.get(o.id);
    if (!f) return { ownerId: o.id, nom, statut: "aucune" };
    return {
      ownerId: o.id,
      nom,
      statut: f.statut,
      courrierGenereAt: f.courrierGenereAt,
      ...(f.soumisAt ? { soumisAt: f.soumisAt } : {}),
      ...(f.valideAt ? { valideAt: f.valideAt } : {}),
      ...(f.mailEnvoyeAt ? { mailEnvoyeAt: f.mailEnvoyeAt } : {}),
      ...(f.derniereRelanceAt ? { derniereRelanceAt: f.derniereRelanceAt } : {}),
      ...(f.connues.emailConnu ? { emailConnu: f.connues.emailConnu } : {}),
      ...(f.soumises?.email ? { emailSoumis: f.soumises.email } : {}),
      ...(f.soumises ? { soumises: f.soumises } : {}),
      connues: {
        ...(f.connues.telFixe ? { telFixe: f.connues.telFixe } : {}),
        ...(f.connues.telPortable ? { telPortable: f.connues.telPortable } : {}),
        ...(f.connues.adrVille ? { adrVille: f.connues.adrVille } : {}),
      },
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <FicheDossierReprise
        dossier={vue}
        analyseInitiale={analyseInitiale}
        modeIa={modeIa}
        ecritureReelle={ecritureReelle}
        dejaInjecte={dejaInjecte}
        fiches={fichesVue}
        aDesOwners={owners.length > 0}
        mailActif={mailActif}
      />

      <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
        {!persistant && (
          <>
            Etat non persistant (memoire) : ce dossier est perdu au redemarrage du serveur. La persistance
            Supabase s&apos;active avec COPRO_SOURCE=supabase, sans changer cet ecran.{" "}
          </>
        )}
        {ecritureReelle ? (
          <span className="font-medium text-err-700">
            ATTENTION : l&apos;injection eStale est en mode REEL (ESTALE_ECRITURE=reel) - ecritures en PRODUCTION.
          </span>
        ) : (
          <>L&apos;injection eStale est en mode DRY-RUN (aucune ecriture reelle).</>
        )}
      </p>
    </div>
  );
}
