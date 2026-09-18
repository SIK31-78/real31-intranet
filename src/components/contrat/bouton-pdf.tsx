"use client";

// Telecharger un PDF produit par le serveur (Chromium, 3 a 8 s a froid) : le bouton dit
// qu'il travaille, puis declenche l'enregistrement. Un lien nu restait muet pendant
// l'attente (Sekou, 17/09/2026 : « que ce soit silencieux, c'est ça le problème »), et
// une erreur s'affichait en page blanche au lieu d'un message.

import { useState, type ComponentProps } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { telechargerPdf } from "./telecharger-pdf";

export function BoutonPdf({
  href,
  enfants = "Télécharger le PDF",
  variant = "primary",
  size,
  className,
}: {
  href: string;
  enfants?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);

  async function telecharger() {
    setEnCours(true);
    try {
      const res = await telechargerPdf(href);
      if (!res.ok) toast.err(res.erreur);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={telecharger} disabled={enCours} aria-busy={enCours}>
      {enCours ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Download strokeWidth={1.5} />}
      {enCours ? "Préparation du PDF…" : enfants}
    </Button>
  );
}
