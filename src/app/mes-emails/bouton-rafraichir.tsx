"use client";

// Bouton "Actualiser" : client component pour exploiter useFormStatus. Depuis le
// passage en lecture live (2026-08-23) il n'y a plus de synchronisation -- la page lit
// deja les boites a chaque rendu. Ce bouton relit MAINTENANT, pour le geste. La lecture
// Graph prend une seconde ou deux : le bouton se grise pendant l'attente (evite les
// clics repetes). Doit etre rendu DANS le <form action=...> parent.

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function BoutonRafraichir() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
        className={pending ? "animate-spin" : undefined}
      >
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 21v-5h5" />
      </svg>
      {pending ? "Lecture…" : "Actualiser"}
    </Button>
  );
}
