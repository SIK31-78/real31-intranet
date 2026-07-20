"use client";

import { useState, useId, type ReactNode } from "react";
import { Lock, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import type { FicheCopro } from "@/lib/domain/copropriete";
import type { Dossier } from "@/lib/domain/dossier";
import type { EtatListeSecoursCS } from "@/lib/services/coproprietes/etat-liste-secours-cs";
import { CoproHeader } from "./copro-header";
import { FicheVueEnsemble } from "./fiche-vue-ensemble";
import { FicheEvenements } from "./fiche-evenements";
import { DossiersCoproApercu } from "@/components/dossiers/dossiers-copro-apercu";

type Onglet = "ensemble" | "evenements" | "dossiers";

// Onglets verrouilles : modules a venir. Grises, non cliquables (post-MVP). Sinistres
// est un onglet-lien vers l'app externe ; Documents a ete retire (decision Sekou).
const VERROUILLES = ["Contrats", "Comptabilité"];

export function FicheCoproVue({
  fiche,
  dossiers,
  mailActif = false,
  estComptable = false,
  listeSecoursCS,
}: {
  fiche: FicheCopro;
  dossiers: Dossier[];
  mailActif?: boolean;
  /** Le visiteur est du pole comptable (lecture transverse) : le pole compta de la fiche
   *  s'ouvre a lui (role "comptable"), le reste de la fiche reste en lecture. */
  estComptable?: boolean;
  /** Etat de la liste de diffusion CS (secours) : source active du mail + adresses editables. */
  listeSecoursCS?: EtatListeSecoursCS;
}) {
  const [onglet, setOnglet] = useState<Onglet>("ensemble");
  const panelId = useId();

  return (
    <div className="flex flex-col gap-5">
      <CoproHeader copro={fiche.copro} />

      {/* role=tablist requis WCAG 2.2 - pattern Tabs */}
      <div
        role="tablist"
        aria-label="Sections de la fiche"
        className="flex items-center gap-1 border-b border-line overflow-x-auto"
      >
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
        {/* Sinistres : onglet-lien vers l'app externe (nouvel onglet). */}
        <a
          href="https://sinistres.real31.app/"
          target="_blank"
          rel="noreferrer"
          role="tab"
          title="Ouvrir l'application Sinistres (nouvel onglet)"
          className="inline-flex items-center gap-1 px-3 py-2 text-[13px] -mb-px border-b-2 border-transparent text-ink-2 hover:text-ink transition-colors whitespace-nowrap"
        >
          Sinistres
          <ExternalLink strokeWidth={1.5} className="w-3 h-3 text-ink-4" aria-hidden="true" />
        </a>
        {VERROUILLES.map((label) => (
          // Onglet verrouille : button disabled pour rester dans le tablist et etre annonce par les SR
          <button
            key={label}
            type="button"
            role="tab"
            disabled
            aria-disabled="true"
            aria-selected={false}
            title="Disponible dans un prochain module"
            className="inline-flex items-center gap-1 px-3 py-2 text-[13px] text-ink-3 opacity-60 cursor-not-allowed whitespace-nowrap"
          >
            {/* aria-hidden : l'icone cadenas est decorative, le texte suffit */}
            <Lock strokeWidth={1.5} className="w-3 h-3" aria-hidden="true" />
            {label}
            <span className="sr-only">(non disponible)</span>
          </button>
        ))}
      </div>

      {onglet === "ensemble" && (
        <div role="tabpanel" id={`${panelId}-ensemble`} aria-labelledby="tab-ensemble" tabIndex={0}>
          <FicheVueEnsemble
            fiche={fiche}
            mailActif={mailActif}
            estComptable={estComptable}
            listeSecoursCS={listeSecoursCS}
          />
        </div>
      )}
      {onglet === "evenements" && (
        <div role="tabpanel" id={`${panelId}-evenements`} aria-labelledby="tab-evenements" tabIndex={0}>
          <FicheEvenements evenements={fiche.prochains} />
        </div>
      )}
      {onglet === "dossiers" && (
        <div role="tabpanel" id={`${panelId}-dossiers`} aria-labelledby="tab-dossiers" tabIndex={0}>
          <DossiersCoproApercu dossiers={dossiers} />
        </div>
      )}
    </div>
  );
}

function Tab({
  id,
  panelId,
  active,
  onClick,
  count,
  children,
}: {
  id: string;
  panelId: string;
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={panelId}
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors whitespace-nowrap",
        active
          ? "border-green-500 text-ink font-medium"
          : "border-transparent text-ink-2 hover:text-ink",
      )}
    >
      {children}
      {count !== undefined && (
        <span className="font-mono text-[11px] text-ink-3">{count}</span>
      )}
    </button>
  );
}
