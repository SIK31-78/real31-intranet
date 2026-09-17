"use client";

// Telecharger un PDF produit par le serveur (Chromium, 3 a 8 s a froid) : le bouton dit
// qu'il travaille, puis declenche l'enregistrement. Un lien nu restait muet pendant
// l'attente (Sekou, 17/09/2026 : « que ce soit silencieux, c'est ça le problème »), et
// une erreur s'affichait en page blanche au lieu d'un message.

import { useState, type ComponentProps } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

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
      const r = await fetch(href, { credentials: "same-origin" });
      if (!r.ok) {
        toast.err((await r.text()).slice(0, 300) || `Téléchargement impossible (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const nom = nomDepuisEntete(r.headers.get("content-disposition")) ?? "contrat.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.err("Téléchargement impossible : le serveur n'a pas répondu.");
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

/** Le nom de fichier de l'en-tete Content-Disposition, version UTF-8 (`filename*`) d'abord. */
function nomDepuisEntete(entete: string | null): string | null {
  if (!entete) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(entete);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]!);
    } catch {
      /* on retombe sur filename= */
    }
  }
  const ascii = /filename="([^"]+)"/i.exec(entete);
  return ascii ? ascii[1]! : null;
}
