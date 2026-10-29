"use client";

// « Comptabilité » (demande de Sekou, 28/10/2026) : à côté de « Pas pour moi », un clic envoie
// le mail de la boîte partagée, rangé chez le binôme, dans le dossier « Comptabilité » de la
// même boîte (syndic2, syndic4…). Le journal du tri garde le geste et la copro du mail ; il
// s'annule depuis l'écran Tri des e-mails, comme tout rangement. Pas d'« Annuler » ici : une
// fois parti, le mail n'est plus distribué au binôme (même règle que « Pas pour moi »).

import { useTransition } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { envoyerEnComptabiliteAction } from "@/app/mes-emails/actions-comptabilite";

/** `compact` : en petit, en texte, dans la barre d'actions du volet (29/10/2026). */
export function EnvoyerEnComptabilite({ emailId, boite, onParti, compact = false }: { emailId: string; boite: string; onParti: () => void; compact?: boolean }) {
  const toast = useToast();
  const [enCours, demarrer] = useTransition();

  function envoyer() {
    demarrer(async () => {
      const r = await envoyerEnComptabiliteAction(emailId, boite);
      if (!r.ok) return void toast.err(r.erreur);
      toast.ok(`Envoyé en Comptabilité (${boite.split("@")[0]}).`);
      onParti();
    });
  }

  return (
    <Button size={compact ? "sm" : "lg"} variant={compact ? "ghost" : "secondary"} onClick={envoyer} disabled={enCours} title="Envoyer ce mail dans le dossier Comptabilité de la boîte partagée">
      <Calculator strokeWidth={1.5} />
      Comptabilité
    </Button>
  );
}
