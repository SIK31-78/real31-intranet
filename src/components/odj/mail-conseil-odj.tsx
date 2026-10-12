"use client";

// « Préparer le mail au conseil syndical » (REA-146), a cote des telechargements de l'ODJ.
//
// Le clic cree un BROUILLON dans la boite Outlook du gestionnaire (rien n'est envoye) : liste
// du CS en destinataires, l'ODJ rempli en PDF joint. Une fois cree, le bouton laisse la
// place a un lien « Ouvrir le brouillon dans Outlook ». Un lien plutot qu'un window.open
// apres l'appel serveur : les navigateurs bloquent une fenetre ouverte hors du clic.
//
// Aucun Graph ici : l'action serveur passe par le service et le port mail.

import { useState, useTransition } from "react";
import { ExternalLink, Mail } from "lucide-react";
import { Button, ButtonAnchor } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type Resultat = { ok: true; webLink?: string; destinataires: number } | { ok: false; erreur: string };

export function MailConseilOdj({ onPreparer }: { onPreparer: () => Promise<Resultat> }) {
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [lien, setLien] = useState<string | undefined>();

  function preparer() {
    demarrer(async () => {
      const r = await onPreparer();
      if (!r.ok) {
        toast.err(r.erreur);
        return;
      }
      const qui = r.destinataires > 1 ? `${r.destinataires} destinataires` : "1 destinataire";
      toast.ok(`Brouillon créé dans vos Brouillons Outlook (${qui}, ODJ en PDF joint). Relisez-le avant l'envoi.`);
      setLien(r.webLink);
    });
  }

  if (lien) {
    return (
      <ButtonAnchor href={lien} target="_blank" rel="noopener noreferrer" variant="secondary">
        <ExternalLink strokeWidth={1.5} />
        Ouvrir le brouillon dans Outlook
      </ButtonAnchor>
    );
  }

  return (
    <Button
      variant="ghost"
      loading={pending}
      onClick={preparer}
      title="Crée un brouillon dans votre boîte Outlook, adressé au conseil syndical, avec l'ODJ rempli en PDF. Rien n'est envoyé."
    >
      <Mail strokeWidth={1.5} />
      Préparer le mail au conseil syndical
    </Button>
  );
}
