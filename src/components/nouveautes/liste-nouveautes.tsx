"use client";

// Les listes de /nouveautes : « À venir / en cours » et « Récemment livré ». On n'en
// montre que les 5 premieres, le reste se deplie.
//
// POURQUOI UN COMPOSANT CLIENT plutot qu'un <details> natif (comme <Aide>) : le bouton
// « Afficher plus » doit etre le MEME geste que sur la facturation et le recap AG
// (Button ghost sm), et chaque ligne contient deja un <details> pour son resume public.
// Un <details> de plus autour de la liste aurait empile un depliage dans un depliage,
// avec deux affordances differentes a l'ecran. L'etat reste local (un booleen) : la
// page /nouveautes, elle, reste un Server Component.

import { useState } from "react";
import { Bug, Lightbulb, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateLongue } from "@/lib/format-date";
import type { EntreePublique } from "@/lib/domain/feedback";

/** Ce qui compte, c'est le haut de la liste : le reste est de l'archive. */
const CAP_AFFICHAGE = 5;

function TypePastille({ type }: { type: EntreePublique["type"] }) {
  const bug = type === "bug";
  const Icon = bug ? Bug : Lightbulb;
  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
        bug ? "bg-info-50 text-info-700" : "bg-green-50 text-green-700"
      }`}
    >
      <Icon strokeWidth={1.5} className="h-4 w-4" />
    </span>
  );
}

/** Ligne depliable quand un RESUME PUBLIC existe (redige au triage hebdo - jamais la
 *  description interne). <details> natif : aucun etat a tenir. */
function Ligne({ entree, droite }: { entree: EntreePublique; droite: React.ReactNode }) {
  if (!entree.resume) {
    return (
      <li className="flex items-center gap-3 rounded-lg border border-line bg-surface shadow-1 px-4 py-3">
        <TypePastille type={entree.type} />
        <span className="min-w-0 flex-1 text-body text-ink">{entree.titre}</span>
        {droite}
      </li>
    );
  }
  return (
    <li className="rounded-lg border border-line bg-surface shadow-1">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <TypePastille type={entree.type} />
          <span className="min-w-0 flex-1 text-body text-ink">{entree.titre}</span>
          {droite}
          <ChevronDown
            strokeWidth={1.5}
            className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-180"
          />
        </summary>
        <p className="border-t border-line px-4 py-3 pl-11 text-body leading-relaxed text-ink-2 whitespace-pre-wrap">
          {entree.resume}
        </p>
      </details>
    </li>
  );
}

function droiteAVenir(entree: EntreePublique) {
  return entree.statut === "en_cours" ? (
    <Badge ton="warn" dot>
      En cours
    </Badge>
  ) : (
    <Badge ton="info" dot>
      Prévu
    </Badge>
  );
}

function droiteLivre(entree: EntreePublique) {
  return entree.livreAt ? (
    <span className="shrink-0 text-body text-ink-3">{formatDateLongue(entree.livreAt.slice(0, 10))}</span>
  ) : null;
}

export function ListeNouveautes({
  entrees,
  variante,
}: {
  entrees: EntreePublique[];
  /** « À venir » affiche un statut a droite, « livré » affiche la date de livraison. */
  variante: "a_venir" | "livre";
}) {
  const [deplie, setDeplie] = useState(false);

  const affichees = deplie ? entrees : entrees.slice(0, CAP_AFFICHAGE);
  const reste = entrees.length - affichees.length;

  return (
    <>
      <ul className="flex flex-col gap-2">
        {affichees.map((e, i) => (
          <Ligne
            key={`${variante}-${i}`}
            entree={e}
            droite={variante === "a_venir" ? droiteAVenir(e) : droiteLivre(e)}
          />
        ))}
      </ul>
      {reste > 0 && (
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={() => setDeplie(true)}>
            Afficher plus
          </Button>
        </div>
      )}
    </>
  );
}
