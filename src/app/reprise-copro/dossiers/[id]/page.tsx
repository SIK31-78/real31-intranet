// FICHE d'un dossier de reprise (tableau de suivi d'équipe, ADR-037). Server component
// (force-dynamic) : lit le dossier, projette une vue sérialisable (en-tête + équipe + checklist +
// journal), calcule la prochaine étape, joint les fiches de renseignements, délègue au client.
// 404 propre si le dossier n'existe pas.
//
// RÔLE : la fiche est LISIBLE et VIVABLE par tout gestionnaire (statuts, assignations, notes,
// échéances, étapes ad hoc, équipe, cadrage, journal) ; l'archivage / la suppression et les gestes
// des fiches de renseignements sont réservés aux admins reprise (grisés, garde côté serveur).

import { notFound, redirect } from "next/navigation";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { estAdminReprise } from "@/lib/auth/roles";
import {
  getRepriseDossierRepository,
  getFicheRenseignementsRepository,
  reprisePersistanceSupabase,
  ecritureEstaleReelle,
} from "@/lib/reprise/adapters/router";
import { obtenirDossier } from "@/lib/reprise/services/suivi-dossier";
import { avancement, estArchive } from "@/lib/reprise/domain/dossier";
import { prochaineEtape } from "@/lib/reprise/domain/prochaine-etape";
import { listerCollaborateurs } from "@/app/reprise-copro/collaborateurs";
import { FicheDossierReprise } from "./fiche-dossier-reprise";
import type { DossierFicheVue } from "./vues";
import type { FicheOwnerVue } from "./fiche-renseignements-bloc";

export const dynamic = "force-dynamic";

export default async function FicheDossierPage({ params }: { params: Promise<{ id: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const { id } = await params;
  const dossier = await obtenirDossier(getRepriseDossierRepository(), decodeURIComponent(id));
  if (!dossier) notFound();

  const aujourdHui = new Date().toISOString().slice(0, 10);
  const collaborateurs = await listerCollaborateurs();

  const vue: DossierFicheVue = {
    ref: dossier.ref,
    nomUsuel: dossier.nomUsuel,
    ...(dossier.adresse ? { adresse: dossier.adresse } : {}),
    ...(dossier.sortant ? { sortant: dossier.sortant } : {}),
    ...(dossier.dateBascule ? { dateBascule: dossier.dateBascule } : {}),
    archive: estArchive(dossier),
    avancement: avancement(dossier),
    etapesFaites: dossier.etapes.filter((e) => e.statut === "fait" || e.statut === "ignore").length,
    etapesTotal: dossier.etapes.length,
    etapes: dossier.etapes,
    equipe: dossier.equipe ?? {},
    journal: dossier.journal.map((j) => ({ date: j.date, texte: j.texte, ...(j.auteur ? { auteur: j.auteur } : {}) })),
  };

  const etapeSuivante = prochaineEtape(dossier.etapes, aujourdHui);

  const persistant = reprisePersistanceSupabase();
  const ecritureReelle = ecritureEstaleReelle();
  const mailActif = mailModuleActifPour(g.email);
  const adminReprise = estAdminReprise(g.email);

  // Fiches de renseignements : on joint les owners du jeu (nom) aux fiches persistées (statut,
  // dates, réponse). Un owner sans fiche apparaît en statut « aucune » (courrier à générer).
  const owners = dossier.jeu?.owners ?? [];
  const fichesBrutes = await getFicheRenseignementsRepository().listerParDossier(dossier.ref);
  const parOwner = new Map(fichesBrutes.map((f) => [f.ownerId, f]));
  const fichesVue: FicheOwnerVue[] = owners.map((o) => {
    const nom = [o.civilite, o.nom, o.prenom].filter(Boolean).join(" ").trim() || o.id;
    const f = parOwner.get(o.id);
    // Email connu = celui de la fiche (snapshot) OU, à défaut, celui de l'owner dans le jeu (permet
    // le bouton « envoyer par email » AVANT toute génération de fiche).
    const emailJeu = o.email;
    if (!f) return { ownerId: o.id, nom, statut: "aucune", ...(emailJeu ? { emailConnu: emailJeu } : {}) };
    return {
      ownerId: o.id,
      nom,
      statut: f.statut,
      courrierGenereAt: f.courrierGenereAt,
      ...(f.canal ? { canal: f.canal } : {}),
      ...(f.envoiEmailAt ? { envoiEmailAt: f.envoiEmailAt } : {}),
      ...(f.soumisAt ? { soumisAt: f.soumisAt } : {}),
      ...(f.valideAt ? { valideAt: f.valideAt } : {}),
      ...(f.mailEnvoyeAt ? { mailEnvoyeAt: f.mailEnvoyeAt } : {}),
      ...(f.derniereRelanceAt ? { derniereRelanceAt: f.derniereRelanceAt } : {}),
      ...((f.connues.emailConnu ?? emailJeu) ? { emailConnu: f.connues.emailConnu ?? emailJeu } : {}),
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
        etapeSuivante={etapeSuivante}
        collaborateurs={collaborateurs}
        aujourdHui={aujourdHui}
        nbFichesGenerees={fichesBrutes.length}
        ecritureReelle={ecritureReelle}
        fiches={fichesVue}
        aDesOwners={owners.length > 0}
        mailActif={mailActif}
        adminReprise={adminReprise}
      />

      {!persistant && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          État non persistant (mémoire) : ce dossier est perdu au redémarrage du serveur. La persistance
          Supabase s&apos;active avec COPRO_SOURCE=supabase, sans changer cet écran.
        </p>
      )}
    </div>
  );
}
