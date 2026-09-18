// LA HOME de l'intranet (bascule Sequence 3.B, valide Sekou) : deux zones bien
// Route servie a tout le monde sauf le comptable pur (pageAccueilPour -> /comptabilite).
// Donnees via services cloisonnes (getGestionnaireCourant -> managerId), jamais d'acces
// adapter/Supabase direct (ADR-001).
//
// Refonte UI (2026-09) : l'accueil repond a UNE question - "qu'est-ce que je fais
// maintenant ?". Le bouton primaire de la page est l'action de l'AG la plus urgente
// (derivee d'actionDuMoment via get-ag-semaine) ; tout le reste est secondaire. Pas de
// paragraphe sous les titres, pas de carte vide, le gris reserve au secondaire.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Calendar } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getAgSemaine } from "@/lib/services/affaires/get-ag-semaine";
import { getAffairesEnCours } from "@/lib/services/affaires/get-affaires-en-cours";
import { getAccueilComplement } from "@/lib/services/accueil/get-accueil-complement";
import { getAnnoncesActives } from "@/lib/services/annonces/get-annonces-actives";
import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";
import { listerMandatsSansAg } from "@/lib/services/contrat/mandats-sans-ag";
import { retardsPourCopros } from "@/lib/services/cles/lecture";
import { listerCoprosParRequete } from "@/lib/services/coproprietes/lister-copros-cache";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { AgSemaineBloc } from "@/components/affaires/ag-semaine-bloc";
import { AffairesEnCours } from "@/components/affaires/affaires-en-cours";
import { AnnoncesPanel } from "@/components/dashboard/annonces-panel";
import { ProblemesPanel } from "@/components/dashboard/problemes-panel";
import { EchangesComptablesPanel } from "@/components/dashboard/echanges-comptables-panel";
import { AlerteRecapsEnRetard } from "@/components/recap-ag/alerte-recaps-en-retard";
import { AlerteMandatsSansAg } from "@/components/contrat/alerte-mandats-sans-ag";
import { AlerteClesEnRetard } from "@/components/cles/alerte-cles-en-retard";

import { jourParis } from "@/lib/services/date-du-jour";
export const metadata: Metadata = { title: "Accueil - REAL31 Intranet" };

// Lit la vraie data en mode supabase : rendu a la demande.
export const dynamic = "force-dynamic";

export default async function AccueilPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const today = jourParis();
  // Independants -> en parallele (gain de latence). Tous cloisonnes sur g.id.
  const [agSemaine, affaires, complement, annonces, recapsEnRetard, mandatsSansAg, clesEnRetard] = await Promise.all([
    getAgSemaine(g.id),
    getAffairesEnCours(g.id),
    getAccueilComplement(g),
    // Annonces CIBLEES : filtrees pour CE collaborateur (groupe / son agence / son email).
    getAnnoncesActives({ email: g.email, agencyId: g.agencyId }),
    // Recaps d'AG jamais rentres. `estComptable: false` : cette page n'est PAS servie au
    // comptable pur (pageAccueilPour le renvoie sur /comptabilite), le cadrage est donc
    // toujours le portefeuille. Degrade en liste vide, jamais bloquant pour l'accueil.
    listerRecapsEnRetard({ managerId: g.id, email: g.email, estComptable: false }, today),
    // Mandats a 3 mois de leur fin sans AG posee (Sekou, 14/09 : « pour qu'on passe pas
    // a cote »). Degrade en liste vide.
    listerMandatsSansAg(g.id, today),
    // Trousseaux de cles en retard sur les copros du portefeuille (ADR-040). Degrade en [].
    listerCoprosParRequete(g.id).then((copros) => retardsPourCopros(copros.map((c) => c.code), today)).catch(() => []),
  ]);

  const prenom = g.nomComplet.split(" ")[0];

  return (
    <AppShell user={g} active="accueil" breadcrumb="Accueil">
      <Page largeur="travail">
        {/* En-tete SANS rappel de l'action urgente (Sekou 2026-09-10) : la meme AG est
            juste en dessous, en tete de "Vos assemblees generales", avec son bouton.
            Le repeter en haut faisait deux fois la meme chose sur le meme ecran. */}
        <PageHeader
          eyebrow={formatDateLongue(today)}
          titre={`Bonjour ${prenom}`}
          actions={
            <ButtonLink href="/calendrier" variant="secondary">
              <Calendar strokeWidth={1.5} /> Calendrier AG/CS
            </ButtonLink>
          }
        />

        {/* Copros aux dates heritees a verifier avant qu'elles n'entrent dans le cockpit.
            Conditionnel (rien si aucune). */}
        {complement.aPrendreEnMain > 0 && (
          <Callout
            ton="warn"
            titre={`${complement.aPrendreEnMain} copropriété${complement.aPrendreEnMain > 1 ? "s" : ""} à prendre en main`}
            actions={
              <ButtonLink href="/copropriete" variant="secondary" size="sm">
                Vérifier les dates
                <ArrowRight strokeWidth={1.5} />
              </ButtonLink>
            }
          >
            les dates héritées sont à confirmer avant qu&apos;elles n&apos;entrent dans votre planification.
          </Callout>
        )}

        {/* Recaps d'AG en retard. HAUT de page et avant les annonces : c'est la seule zone
            rouge de l'accueil, elle signale un engagement non tenu (le delai de recap) que
            la comptabilite attend pour travailler. Le composant ne rend RIEN quand la liste
            est vide - pas de bandeau vert de felicitations, pas de titre orphelin. */}
        <AlerteRecapsEnRetard lignes={recapsEnRetard} variante="gestionnaire" />

        {/* Mandats qui se terminent sans AG planifiee : juste sous les recaps, meme
            registre (un trou dans la chaine AG), avant les annonces. Rien si vide. */}
        <AlerteMandatsSansAg lignes={mandatsSansAg} />

        {/* Trousseaux de cles chez une entreprise au-dela du retour prevu, sur vos copros. Rien si vide. */}
        <AlerteClesEnRetard lignes={clesEnRetard} />

        {/* Annonces du reseau (direction), pilotees depuis /admin/annonces. Rien si vide :
            une carte "aucune annonce" n'apprend rien. */}
        {annonces.length > 0 && <AnnoncesPanel annonces={annonces} />}

        {/* ZONE 1 - Assemblees generales : la colonne vertebrale, PAS un dossier. Masquee
            quand rien ne presse. */}
        {agSemaine.length > 0 && (
          <Section
            id="accueil-ag"
            titre="Vos assemblées générales"
            compte={agSemaine.length}
            actions={
              // `secondary` et pas `ghost` (Sekou, 2026-09-11 : "pas alignes et pire pas
              // mis en evidence"). Un bouton fantome n'a pas de bordure : cale a droite,
              // son texte tombe 10 px en dedans du bord des cartes et du bouton
              // "Calendrier AG/CS", et l'oeil lit ce retrait comme un desalignement.
              // La bordure du secondaire le remet d'aplomb ET le rend visible.
              <ButtonLink href="/copropriete" variant="secondary" size="sm">
                Toutes les AG
                <ArrowRight strokeWidth={1.5} />
              </ButtonLink>
            }
          >
            <AgSemaineBloc lignes={agSemaine} />
          </Section>
        )}

        {/* ZONE 2 - Dossiers en cours : sinistres, travaux, impayes. Distincte de l'AG. */}
        <Section
          id="accueil-dossiers"
          titre="Vos dossiers en cours"
          actions={
            <ButtonLink href="/dossiers" variant="secondary" size="sm">
              Tous les dossiers
              <ArrowRight strokeWidth={1.5} />
            </ButtonLink>
          }
        >
          <AffairesEnCours affaires={affaires} />
        </Section>

        {/* Echanges comptables : notes de la comptable NON RESOLUES sur les copros du
            gestionnaire - il doit repondre. Conditionnel : rien si aucun echange ouvert. */}
        {complement.echangesComptables.length > 0 && (
          <Section id="accueil-compta" titre="Échanges comptables" compte={complement.echangesComptables.length}>
            <EchangesComptablesPanel echanges={complement.echangesComptables} />
          </Section>
        )}

        {/* ZONE 3 - Points signales : problemes coches en supervision AG, actionnables.
            Conditionnel : rien (pas de titre orphelin) si vide. */}
        {complement.problemes.length > 0 && (
          <Section
            id="accueil-problemes"
            titre="Points signalés"
            compte={complement.problemes.reduce((n, grp) => n + grp.items.length, 0)}
          >
            <ProblemesPanel problemes={complement.problemes} />
          </Section>
        )}
      </Page>
    </AppShell>
  );
}
