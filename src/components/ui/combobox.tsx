"use client";

import { useId, useState, type KeyboardEvent } from "react";

// Ce qu'il faut pour qu'une liste de resultats sous un champ soit un vrai combobox : les
// roles ARIA, l'option active annoncee au lecteur d'ecran, et le clavier (fleches, Entree,
// Echap). Audit du 16/09/2026 : les deux autocompletions du registre n'etaient qu'a la souris.

export function useCombobox<T>(options: T[], choisir: (option: T) => void, fermer?: () => void) {
  const listeId = useId();
  const [actif, setActif] = useState(-1);
  // Nouvelle liste : plus d'option active (on ne garde pas un index d'une autre recherche).
  // Remise a zero pendant le rendu, pas dans un effet (pas de rendu en cascade).
  // Comparaison par contenu : un tableau recalcule a chaque rendu avec les memes elements
  // ne doit pas remettre la selection a zero (ni boucler).
  const [listeVue, setListeVue] = useState(options);
  if (listeVue !== options && (listeVue.length !== options.length || listeVue.some((o, i) => o !== options[i]))) {
    setListeVue(options);
    setActif(-1);
  }
  const ouvert = options.length > 0;

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!ouvert) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActif((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActif((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && actif >= 0 && options[actif] !== undefined) {
      e.preventDefault();
      choisir(options[actif]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActif(-1);
      fermer?.();
    }
  }

  const idOption = (i: number) => `${listeId}-${i}`;
  return {
    actif,
    setActif,
    onKeyDown,
    /** A etaler sur l'<input>. */
    input: {
      role: "combobox" as const,
      "aria-expanded": ouvert,
      "aria-controls": listeId,
      "aria-autocomplete": "list" as const,
      ...(actif >= 0 ? { "aria-activedescendant": idOption(actif) } : {}),
    },
    /** A etaler sur le <ul>. */
    liste: { id: listeId, role: "listbox" as const },
    /** A etaler sur chaque <li>. */
    option: (i: number) => ({ id: idOption(i), role: "option" as const, "aria-selected": i === actif, onMouseEnter: () => setActif(i) }),
  };
}
