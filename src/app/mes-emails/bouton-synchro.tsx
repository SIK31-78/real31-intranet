"use client";

// Bouton de synchronisation de la boite : client component pour exploiter useFormStatus.
// La synchro (appel Graph) peut prendre plusieurs secondes -> tant que l'action serveur
// tourne, le bouton se grise et affiche "Synchronisation…" (evite les clics repetes et
// donne un retour visuel d'attente). Doit etre rendu DANS le <form action=...> parent.

import { useFormStatus } from "react-dom";

export function BoutonSynchro() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-green-700 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-green-800 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {pending ? "Synchronisation…" : "Synchroniser ma boîte"}
    </button>
  );
}
