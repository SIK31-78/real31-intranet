import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Aide } from "./aide";
import { Eyebrow } from "./eyebrow";
import { FilAriane } from "@/components/ui/fil-ariane";

// Conteneur de page + en-tete. DEUX largeurs seulement :
//   lecture = 900 px  (documents, formulaires : ODJ, recap)
//   travail = 1200 px (ecrans de pilotage : accueil, fiche, supervision, listes)
// L'en-tete NE SE PRESENTE PAS : pas de paragraphe sous le h1. Ce qui aide vraiment
// va dans `aide` (repliee). Une seule action `primary` dans `actions`.

const LARGEURS = {
  lecture: "max-w-[900px]",
  travail: "max-w-[1200px]",
} as const;

export function Page({
  largeur = "travail",
  filAriane = true,
  children,
}: {
  largeur?: keyof typeof LARGEURS;
  /** Fil d'Ariane ("REAL31 / Coproprietes - SE999") en tete de page. Depuis la fusion
   *  de la topbar dans le rail, c'est ici qu'il vit. */
  filAriane?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full px-4 py-5 sm:px-6 md:px-8 md:py-6 flex flex-col gap-5", LARGEURS[largeur])}>
      {filAriane && <FilAriane />}
      {children}
    </div>
  );
}

export function PageHeader({
  titre,
  code,
  badge,
  eyebrow,
  meta,
  actions,
  aide,
}: {
  titre: ReactNode;
  /** Code copro (mono), a cote du titre. */
  code?: string;
  /** Un Badge a cote du titre (source, etat). */
  badge?: ReactNode;
  /** Sur-titre (ex. la date du jour). */
  eyebrow?: ReactNode;
  /** UNE ligne de contexte : adresse, AG visee... Pas une explication. */
  meta?: ReactNode;
  /** Boutons de l'en-tete : un seul `primary`. */
  actions?: ReactNode;
  /** Aide repliee (contenu de <Aide>). */
  aide?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      {/* flex-WRAP (REA-252) : quand le titre et les boutons ne tiennent pas sur une ligne,
          les boutons passent SOUS le titre au lieu de l'ecraser dans une colonne etroite
          (l'ODJ et ses 4 boutons dans la largeur "lecture"). Le saut depend du contenu, pas
          d'un point de rupture : une page dont tout tient sur une ligne ne bouge pas. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex flex-col gap-0.5">
          {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-page font-semibold tracking-tight text-ink">{titre}</h1>
            {code && <span className="font-mono text-body text-ink-2">{code}</span>}
            {badge}
          </div>
          {meta && <p className="text-body text-ink-2">{meta}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 max-w-full pt-0.5">{actions}</div>}
      </div>
      {aide && <Aide>{aide}</Aide>}
    </header>
  );
}
