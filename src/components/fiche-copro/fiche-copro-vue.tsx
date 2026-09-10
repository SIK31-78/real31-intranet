"use client";

import { useState, useId } from "react";
import type { FicheCopro } from "@/lib/domain/copropriete";
import type { Dossier } from "@/lib/domain/dossier";
import type { EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import { TabList, Tab, TabLink, TabVerrouille, TabPanel } from "@/components/ui/tabs";
import { CoproHeader } from "./copro-header";
import { FicheVueEnsemble } from "./fiche-vue-ensemble";
import { FicheEvenements } from "./fiche-evenements";
import { DossiersCoproApercu } from "@/components/dossiers/dossiers-copro-apercu";

type Onglet = "ensemble" | "evenements" | "dossiers";

// Onglets verrouilles : modules a venir. Grises, non cliquables (post-MVP). Sinistres
// et Contrats sont des onglets-liens vers leurs apps externes ; Documents a ete retire
// (decision Sekou).
const VERROUILLES = ["Comptabilité"];

export function FicheCoproVue({
  fiche,
  dossiers,
  mailActif = false,
  listeSecoursCS,
}: {
  fiche: FicheCopro;
  dossiers: Dossier[];
  mailActif?: boolean;
  /** Etat de la liste de diffusion CS (secours) : source active du mail + adresses editables. */
  listeSecoursCS?: EtatListeSecoursCS;
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
        <TabLink href="https://sinistres.real31.app/" title="Ouvrir l'application Sinistres (nouvel onglet)">
          Sinistres
        </TabLink>
        <TabLink href="https://contratscopro.real31.app/" title="Ouvrir l'application Contrats (nouvel onglet)">
          Contrats
        </TabLink>
        {VERROUILLES.map((label) => (
          <TabVerrouille key={label} title="Disponible dans un prochain module">
            {label}
          </TabVerrouille>
        ))}
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
    </div>
  );
}
