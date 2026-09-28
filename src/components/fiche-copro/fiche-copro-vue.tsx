"use client";

import { useState, useId } from "react";
import type { FicheCopro } from "@/lib/domain/copropriete";
import type { Dossier } from "@/lib/domain/dossier";
import type { EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import type { AuteurNote } from "@/lib/domain/compta";
import { TabList, Tab, TabLink, TabPanel } from "@/components/ui/tabs";
import { CoproHeader } from "./copro-header";
import { FicheVueEnsemble } from "./fiche-vue-ensemble";
import { FicheEvenements } from "./fiche-evenements";
import { FicheComptabilite } from "./fiche-comptabilite";
import { DossiersCoproApercu } from "@/components/dossiers/dossiers-copro-apercu";
import { TrousseauxCoproApercu } from "@/components/cles/trousseaux-copro-apercu";
import type { TrousseauResume } from "@/lib/services/cles/lecture";

type Onglet = "ensemble" | "evenements" | "dossiers" | "cles" | "comptabilite";

// Sinistres et Contrats sont des onglets-liens vers leurs apps externes ; Documents a
// ete retire (decision Sekou). Comptabilite, verrouille jusqu'au 28/09/2026, porte la
// preparation des comptes de la prochaine AG et les recaps d'AG.

export function FicheCoproVue({
  fiche,
  dossiers,
  mailActif = false,
  listeSecoursCS,
  trousseaux = [],
  roleCompta = "gestionnaire",
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
}) {
  const [onglet, setOnglet] = useState<Onglet>("ensemble");
  const panelId = useId();

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
        <TabLink href="https://contratscopro.real31.app/" title="Ouvrir l'application Contrats (nouvel onglet)">
          Contrats
        </TabLink>
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
      {onglet === "comptabilite" && (
        <TabPanel id={`${panelId}-comptabilite`} tabId="tab-comptabilite">
          <FicheComptabilite fiche={fiche} role={roleCompta} />
        </TabPanel>
      )}
    </div>
  );
}
