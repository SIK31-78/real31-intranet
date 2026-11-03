"use client";

// Onglets de la page Gestion courante (REA-490) : la facturation trimestrielle, et les
// frais postaux. L'onglet Frais postaux n'est monte qu'a son ouverture : il interroge
// ESTALE, la facturation n'a pas a en payer le prix.

import { useState, type ReactNode } from "react";
import { Tab, TabList, TabPanel } from "@/components/ui/tabs";
import { PanneauFraisPostaux } from "./panneau-frais-postaux";

export type OngletGestionCourante = "facturation" | "frais-postaux";

export function OngletsGestionCourante({
  initial,
  facturation,
}: {
  initial: OngletGestionCourante;
  facturation: ReactNode;
}) {
  const [onglet, setOnglet] = useState<OngletGestionCourante>(initial);
  return (
    <div className="space-y-4">
      <TabList label="Gestion courante">
        <Tab id="gc-t-facturation" panelId="gc-p-facturation" active={onglet === "facturation"} onClick={() => setOnglet("facturation")}>
          Facturation du trimestre
        </Tab>
        <Tab id="gc-t-postaux" panelId="gc-p-postaux" active={onglet === "frais-postaux"} onClick={() => setOnglet("frais-postaux")}>
          Frais postaux
        </Tab>
      </TabList>
      {onglet === "facturation" ? (
        <TabPanel id="gc-p-facturation" tabId="gc-t-facturation">
          <div className="space-y-6">{facturation}</div>
        </TabPanel>
      ) : (
        <TabPanel id="gc-p-postaux" tabId="gc-t-postaux">
          <PanneauFraisPostaux />
        </TabPanel>
      )}
    </div>
  );
}
