"use client";

import { useState, useId } from "react";
import type { FicheCopro } from "@/lib/domain/copropriete";
import type { Dossier } from "@/lib/domain/dossier";
import type { EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import type { AuteurNote } from "@/lib/domain/compta";
import { TabList, Tab, TabLink, TabPanel } from "@/components/ui/tabs";
import { Callout } from "@/components/ui/callout";
import { CoproHeader } from "./copro-header";
import { FicheVueEnsemble } from "./fiche-vue-ensemble";
import { FicheEvenements } from "./fiche-evenements";
import { FicheComptabilite } from "./fiche-comptabilite";
import { DossiersCoproApercu } from "@/components/dossiers/dossiers-copro-apercu";
import { TrousseauxCoproApercu } from "@/components/cles/trousseaux-copro-apercu";
import { OngletContrats } from "@/components/contrats-copro/onglet-contrats";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import type { SuiviCopro } from "@/lib/services/contrats-copro/types";
import type { EntrepriseMetier } from "@/lib/services/contrats-copro/prestataires";
import type { FicheImmeuble, MetierPrestataire } from "@/lib/domain/contrats-copro";

type Onglet = "ensemble" | "evenements" | "dossiers" | "cles" | "contrats" | "comptabilite";

// Sinistres est un onglet-lien vers son app externe ; Documents a ete retire (decision
// Sekou). Contrats est un vrai onglet depuis le module « Contrats & contrôles » (REA-333).
// Comptabilite, verrouille jusqu'au 28/09/2026, porte la preparation des comptes de la
// prochaine AG et les recaps d'AG.

/** Les cycles EN COURS d'un suivi, tous sujets confondus (compteur de l'onglet Contrats). */
function nbCyclesEnCours(s: SuiviCopro): number {
  const vues = [...s.assurance.cycles, ...s.gaz.cycles, ...s.ctqVmc.cycles, ...s.ctqAscenseur.appareils.flatMap((a) => a.cycles)];
  return vues.filter((v) => v.cycle.statut === "en_cours").length;
}

export function FicheCoproVue({
  fiche,
  dossiers,
  mailActif = false,
  listeSecoursCS,
  trousseaux = [],
  roleCompta = "gestionnaire",
  suiviContrats,
  immeuble,
  entreprisesParMetier,
  aujourdhuiISO,
}: {
  fiche: FicheCopro;
  dossiers: Dossier[];
  /** Role dans le fil de notes comptes (pole compta = "comptable"). */
  roleCompta?: AuteurNote;
  mailActif?: boolean;
  /** Etat de la liste de diffusion CS (secours) : source active du mail + adresses editables. */
  listeSecoursCS?: EtatListeSecoursCS;
  /** Trousseaux de cles qui ouvrent cette copro (module Gestion des cles, ADR-040). */
  trousseaux?: TrousseauResume[];
  /** Onglet Contrats (REA-333) : null = lecture impossible, undefined = pas chargé. */
  suiviContrats?: SuiviCopro | null;
  immeuble?: FicheImmeuble;
  entreprisesParMetier?: Record<MetierPrestataire, EntrepriseMetier[]>;
  aujourdhuiISO?: string;
}) {
  const [onglet, setOnglet] = useState<Onglet>("ensemble");
  const panelId = useId();
  const niveauContrats = suiviContrats?.niveauGlobal ?? null;
  const pastilleContrats = niveauContrats === "rouge" ? "bg-err-500" : niveauContrats === "orange" ? "bg-warn-500" : null;

  return (
    <div className="flex flex-col gap-5">
      <CoproHeader copro={fiche.copro} />

      <TabList label="Sections de la fiche">
        <Tab
          id="tab-ensemble"
          panelId={`${panelId}-ensemble`}
          active={onglet === "ensemble"}
          onClick={() => setOnglet("ensemble")}
        >
          Vue d&apos;ensemble
        </Tab>
        <Tab
          id="tab-evenements"
          panelId={`${panelId}-evenements`}
          active={onglet === "evenements"}
          onClick={() => setOnglet("evenements")}
          count={fiche.prochains.length}
        >
          Événements
        </Tab>
        <Tab
          id="tab-dossiers"
          panelId={`${panelId}-dossiers`}
          active={onglet === "dossiers"}
          onClick={() => setOnglet("dossiers")}
          count={dossiers.length}
        >
          Dossiers
        </Tab>
        <Tab
          id="tab-cles"
          panelId={`${panelId}-cles`}
          active={onglet === "cles"}
          onClick={() => setOnglet("cles")}
          count={trousseaux.length}
        >
          Clés
        </Tab>
        <TabLink href="https://sinistres.real31.app/" title="Ouvrir l'application Sinistres (nouvel onglet)">
          Sinistres
        </TabLink>
        <Tab
          id="tab-contrats"
          panelId={`${panelId}-contrats`}
          active={onglet === "contrats"}
          onClick={() => setOnglet("contrats")}
          count={suiviContrats ? nbCyclesEnCours(suiviContrats) : undefined}
        >
          Contrats
          {pastilleContrats && (
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${pastilleContrats}`}
              role="img"
              aria-label={niveauContrats === "rouge" ? "un suivi est figé depuis plus de 60 jours" : "un suivi est figé depuis plus de 30 jours"}
            />
          )}
        </Tab>
        <Tab
          id="tab-comptabilite"
          panelId={`${panelId}-comptabilite`}
          active={onglet === "comptabilite"}
          onClick={() => setOnglet("comptabilite")}
          count={fiche.recapsAg?.length ?? 0}
        >
          Comptabilité
        </Tab>
      </TabList>

      {onglet === "ensemble" && (
        <TabPanel id={`${panelId}-ensemble`} tabId="tab-ensemble">
          <FicheVueEnsemble fiche={fiche} mailActif={mailActif} listeSecoursCS={listeSecoursCS} />
        </TabPanel>
      )}
      {onglet === "evenements" && (
        <TabPanel id={`${panelId}-evenements`} tabId="tab-evenements">
          <FicheEvenements evenements={fiche.prochains} />
        </TabPanel>
      )}
      {onglet === "dossiers" && (
        <TabPanel id={`${panelId}-dossiers`} tabId="tab-dossiers">
          <DossiersCoproApercu dossiers={dossiers} />
        </TabPanel>
      )}
      {onglet === "cles" && (
        <TabPanel id={`${panelId}-cles`} tabId="tab-cles">
          <TrousseauxCoproApercu trousseaux={trousseaux} coproCode={fiche.copro.code} />
        </TabPanel>
      )}
      {onglet === "contrats" && (
        <TabPanel id={`${panelId}-contrats`} tabId="tab-contrats">
          {suiviContrats && immeuble && entreprisesParMetier && aujourdhuiISO ? (
            <OngletContrats suivi={suiviContrats} immeuble={immeuble} entreprisesParMetier={entreprisesParMetier} aujourdhuiISO={aujourdhuiISO} />
          ) : (
            <Callout ton="warn">Les contrats de la copropriété n&rsquo;ont pas pu être lus. Recharge la page dans un instant.</Callout>
          )}
        </TabPanel>
      )}
      {onglet === "comptabilite" && (
        <TabPanel id={`${panelId}-comptabilite`} tabId="tab-comptabilite">
          <FicheComptabilite fiche={fiche} role={roleCompta} />
        </TabPanel>
      )}
    </div>
  );
}
