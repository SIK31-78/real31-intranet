"use client";

// Cc et Cci repliés par défaut dans la fenêtre d'écriture (retour de Sekou, 29/10/2026 :
// « trop chargé ») : deux petits liens au bout de la ligne « À » les ouvrent. Une ligne qui
// a déjà un contenu s'affiche d'elle-même (Répondre à tous, binôme en copie du conseil
// syndical, modèle, brouillon rouvert) ; une fois ouverte, elle reste ouverte, même vidée.

import { useState } from "react";

export type LigneCopie = "cc" | "cci";

/**
 * Les lignes ouvertes après prise en compte des contenus : une ligne non vide rejoint les
 * ouvertes, aucune n'en sort. Rend LE MÊME ensemble quand rien ne change (l'appelant s'en
 * sert pour ne pas reposer l'état à chaque rendu).
 */
export function lignesCopieOuvertes(
  ouvertes: ReadonlySet<LigneCopie>,
  contenus: Partial<Record<LigneCopie, number>>,
): ReadonlySet<LigneCopie> {
  const nouvelles = (Object.keys(contenus) as LigneCopie[]).filter((l) => (contenus[l] ?? 0) > 0 && !ouvertes.has(l));
  return nouvelles.length ? new Set([...ouvertes, ...nouvelles]) : ouvertes;
}

/**
 * L'état des lignes Cc / Cci d'une fenêtre d'écriture. `focus` : la ligne ouverte d'un clic
 * sur son lien, dont le champ prend le curseur à l'apparition.
 */
export function useLignesCopie(contenus: Partial<Record<LigneCopie, number>>) {
  const [ouvertes, setOuvertes] = useState<ReadonlySet<LigneCopie>>(() => lignesCopieOuvertes(new Set(), contenus));
  const [focus, setFocus] = useState<LigneCopie | null>(null);
  // Un contenu arrivé après coup (Répondre à tous, binôme) ouvre la ligne pendant le rendu,
  // sans effet : React rejoue aussitôt le composant avec le nouvel état.
  const apres = lignesCopieOuvertes(ouvertes, contenus);
  if (apres !== ouvertes) setOuvertes(apres);
  return {
    visible: (l: LigneCopie) => apres.has(l),
    focus,
    ouvrir: (l: LigneCopie) => {
      setOuvertes((o) => new Set([...o, l]));
      setFocus(l);
    },
  };
}

/** « Cc  Cci » au bout de la ligne « À » : seulement les liens des lignes encore repliées. */
export function LiensCopie({ lignes, onOuvrir }: { lignes: LigneCopie[]; onOuvrir: (l: LigneCopie) => void }) {
  if (!lignes.length) return null;
  return (
    <span className="shrink-0 flex items-center gap-2 pt-1">
      {lignes.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onOuvrir(l)}
          title={l === "cc" ? "Ajouter des destinataires en copie" : "Ajouter des destinataires en copie cachée"}
          className="text-meta text-ink-3 hover:text-ink hover:underline"
        >
          {l === "cc" ? "Cc" : "Cci"}
        </button>
      ))}
    </span>
  );
}
