// Accueil du module Reprise de copro : un hub vers les deux fonctions
// (nouvelle reprise = extraction + production eStale ; suivi des dossiers).
// Presentation pure, design system natif.
//
// ROLE : le SUIVI est ouvert a tous ; ouvrir une reprise et la revue du mapping comptable sont
// reserves aux ADMINS REPRISE (directeur / manager / super-admin) -> carte GRISEE, jamais cachee
// (le gestionnaire voit que ca existe et sait a qui s'adresser). Cf. lib/auth/roles.ts.

import Link from "next/link";
import type { ComponentType } from "react";
import { FolderInput, ListChecks, Calculator, ArrowRight, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estAdminReprise } from "@/lib/auth/roles";

export default async function RepriseAccueil() {
  const g = await getGestionnaireCourant();
  const admin = estAdminReprise(g?.email);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[20px] font-medium tracking-tight text-ink">Reprise de copropriété</h1>
        <p className="mt-1 text-[13px] text-ink-3 max-w-[640px]">
          Onboarding d&apos;une nouvelle copropriété : de la reprise du patrimoine (lots, clés,
          tantièmes, copropriétaires) jusqu&apos;à l&apos;intégration dans eStale. Fichiers Excel
          versés, contrôles automatiques, récapitulatif avant toute production.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LienCard
          href="/reprise-copro/dossiers"
          icon={FolderInput}
          titre="Nouvelle reprise"
          desc="Créer la copropriété (nom, référence, adresse), puis verser les fichiers Excel du patrimoine depuis sa fiche : le module les relit et les vérifie."
          reserve={!admin}
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
          desc="Analyser les grands livres, mapper chaque compte source vers eStale, trancher les alertes, produire entries.xlsx et vérifier les soldes après import."
          reserve={!admin}
        />
      </div>

      {!admin && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          Le <span className="font-medium text-ink-2">suivi des dossiers</span> est ouvert à tous : tu peux voir où en
          est la reprise de chaque copropriété. Les cartes grisées (ouvrir une reprise, revue du mapping comptable) sont
          réservées aux directeurs et managers.
        </p>
      )}
    </div>
  );
}

function LienCard({
  href,
  icon: Icon,
  titre,
  desc,
  reserve,
}: {
  href: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  titre: string;
  desc: string;
  /** true = fonction reservee aux admins reprise : carte grisee, non cliquable, cadenas + raison. */
  reserve?: boolean;
}) {
  if (reserve) {
    return (
      <Card className="h-full p-4 opacity-60" aria-disabled>
        <div className="flex items-start gap-3">
          <span className="shrink-0 grid place-items-center w-9 h-9 rounded-md bg-surface-2 text-ink-4">
            <Icon strokeWidth={1.5} className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[14px] font-medium text-ink-2">
              {titre}
              <Lock strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">{desc}</p>
            <p className="mt-1.5 text-[11.5px] font-medium text-ink-4">Réservé aux directeurs et managers.</p>
          </div>
        </div>
      </Card>
    );
  }

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
