// Accueil du module Reprise de copro : un hub vers les deux fonctions
// (nouvelle reprise = extraction + production eStale ; suivi des dossiers).
// Presentation pure, design system natif.

import Link from "next/link";
import type { ComponentType } from "react";
import { FolderInput, ListChecks, Calculator, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function RepriseAccueil() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Reprise de copropriété</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[640px]">
          Onboarding d&apos;une nouvelle copropriété : de la reprise du patrimoine (lots, clés,
          tantièmes, copropriétaires) jusqu&apos;à l&apos;intégration dans eStale. Extraction assistée,
          contrôles automatiques, récapitulatif avant toute production.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LienCard
          href="/reprise-copro/dossiers"
          icon={FolderInput}
          titre="Nouvelle reprise"
          desc="Créer la copropriété (nom, référence, adresse), puis analyser les documents depuis sa fiche : l'IA extrait le patrimoine, vous vérifiez."
        />
        <LienCard
          href="/reprise-copro/dossiers"
          icon={ListChecks}
          titre="Suivi des dossiers"
          desc="Suivre l'avancement des reprises en cours, étape par étape (patrimoine, vérification, mise en service)."
        />
        <LienCard
          href="/reprise-copro/mapping-compta"
          icon={Calculator}
          titre="Reprise comptable (mapping)"
          desc="Analyser le grand livre N-1, mapper chaque compte source vers eStale, trancher les alertes d'appariement avant l'import."
        />
      </div>
    </div>
  );
}

function LienCard({
  href,
  icon: Icon,
  titre,
  desc,
}: {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  titre: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-md"
    >
      <Card className="h-full p-4 transition-colors group-hover:border-green-600/40 group-hover:bg-surface-2">
        <div className="flex items-start gap-3">
          <span className="shrink-0 grid place-items-center w-9 h-9 rounded-md bg-green-50 text-green-700">
            <Icon strokeWidth={1.5} className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
              {titre}
              <ArrowRight
                strokeWidth={1.5}
                className="w-3.5 h-3.5 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-green-700"
              />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">{desc}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
