"use client";

// Bouton de fermeture de boucle de la file des recaps : « marquer traité » et son inverse.
// L'erreur est AFFICHEE (et pas seulement toastee) : tant que le SQL de traitement n'est
// pas passe, le serveur repond un message actionnable qui nomme le fichier a executer.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { marquerRecapTraiteAction } from "@/app/comptabilite/recaps/actions";
import { Button } from "@/components/ui/button";

export function BoutonRecapTraite({
  recapId,
  traite,
}: {
  recapId: string;
  /** Etat courant : le bouton propose l'action INVERSE. */
  traite: boolean;
}) {
  const router = useRouter();
  const { ok, err } = useToast();
  const [pending, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function basculer() {
    setErreur(null);
    demarrer(async () => {
      const r = await marquerRecapTraiteAction(recapId, !traite);
      if (r.ok) {
        ok(traite ? "Récap remis à traiter." : "Récap marqué traité.");
        router.refresh();
      } else {
        setErreur(r.erreur);
        err(r.erreur);
      }
    });
  }

  const Icone = traite ? RotateCcw : Check;

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button variant={traite ? "secondary" : "primary"} onClick={basculer} loading={pending}>
        {!pending && <Icone strokeWidth={1.5} />}
        {traite ? "Remettre à traiter" : "Marquer traité"}
      </Button>
      {erreur && (
        <p role="alert" className="text-body text-err-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
