"use client";

// Télécharge l'annuaire Linkus et dit ce qu'il contient (lignes, locataires, copropriétaires
// sans numéro), lu dans l'en-tête X-Annuaire-Bilan de la route.

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { nomDepuisEntete } from "@/components/contrat/telecharger-pdf";
import type { BilanAnnuaire } from "@/lib/domain/linkus";

export function BoutonExportLinkus() {
  const toast = useToast();
  const [enCours, setEnCours] = useState(false);
  const [bilan, setBilan] = useState<BilanAnnuaire | null>(null);

  async function telecharger() {
    setEnCours(true);
    try {
      const r = await fetch("/admin/linkus/annuaire.csv", { credentials: "same-origin" });
      if (!r.ok) {
        toast.err((await r.text()).slice(0, 300) || `Export impossible (${r.status}).`);
        return;
      }
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nomDepuisEntete(r.headers.get("content-disposition")) ?? "annuaire-linkus.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      try {
        setBilan(JSON.parse(r.headers.get("x-annuaire-bilan") ?? "null"));
      } catch {
        setBilan(null);
      }
      toast.ok("Annuaire téléchargé.");
    } catch {
      toast.err("Export impossible : le serveur n'a pas répondu.");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button type="button" onClick={telecharger} disabled={enCours} aria-busy={enCours}>
        {enCours ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Download strokeWidth={1.5} />}
        {enCours ? "Lecture d'ESTALE…" : "Télécharger l'annuaire (CSV)"}
      </Button>
      {bilan && (
        <ul className="text-body text-ink-2 space-y-1">
          <li>{bilan.lignes} contacts sur {bilan.copros} copropriétés, dont {bilan.locataires} locataires.</li>
          <li>{bilan.proprietairesSansNumero} copropriétaires sans aucun numéro dans ESTALE (absents du fichier).</li>
          {bilan.numerosEnDouble > 0 && <li>{bilan.numerosEnDouble} numéros en double écartés (gardés une seule fois).</li>}
        </ul>
      )}
    </div>
  );
}
