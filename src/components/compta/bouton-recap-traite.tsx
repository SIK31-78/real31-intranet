"use client";

// Bouton de fermeture de boucle de la file des recaps : « marquer traité » et son inverse.
// L'erreur est AFFICHEE (et pas seulement toastee) : tant que le SQL de traitement n'est
// pas passe, le serveur repond un message actionnable qui nomme le fichier a executer.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { marquerRecapTraiteAction } from "@/app/comptabilite/recaps/actions";

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
      <button
        type="button"
        onClick={basculer}
        disabled={pending}
        className={
          "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors disabled:opacity-60 " +
          (traite
            ? "border border-line bg-surface text-ink-2 hover:bg-surface-2"
            : "bg-green-700 text-white hover:bg-green-800")
        }
      >
        {pending ? (
          <Loader2 strokeWidth={2} className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Icone strokeWidth={1.5} className="h-3.5 w-3.5" />
        )}
        {traite ? "Remettre à traiter" : "Marquer traité"}
      </button>
      {erreur && (
        <p role="alert" className="text-[12px] text-err-700">
          {erreur}
        </p>
      )}
    </div>
  );
}
