"use client";

// Bouton de synchronisation de la boite : client component pour exploiter useFormStatus.
// La synchro (appel Graph) peut prendre plusieurs secondes -> tant que l'action serveur
// tourne, le bouton se grise et affiche "Synchronisation…" (evite les clics repetes et
// donne un retour visuel d'attente). Doit etre rendu DANS le <form action=...> parent.

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function BoutonSynchro() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending}
      variant="secondary"
    >
      {pending ? "Synchronisation…" : "Synchroniser ma boîte"}
    </Button>
  );
}
