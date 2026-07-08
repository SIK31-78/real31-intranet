"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StatutConfirmation } from "@/lib/domain/confirmation-evenement";
import { confirmerEvenementAction } from "./dates-actions";

// Confirmation d'une prochaine date AG/CS (demande patron) : la date posee est
// proposee au conseil syndical par mail -> badge "A confirmer" + bouton "Confirmer".
// Au retour de mail, le gestionnaire confirme -> badge "Confirmee". Replanifier la
// date reinitialise la confirmation (regle du domaine, statutPourDate).
// N'est rendu que pour une date FUTURE (le service ne pose pas de statut sinon).
export function ConfirmationEvenement({
  coproCode,
  type,
  statut,
}: {
  coproCode: string;
  type: "AG" | "CS";
  statut: StatutConfirmation;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Affichage optimiste : au succes du clic, on bascule le badge en "Confirmee" tout de
  // suite (la revalidation serveur ne rafraichit pas toujours ce composant client en place ;
  // au prochain chargement, statutPourDate confirmera - la base est deja a jour).
  const [confirmeOptimiste, setConfirmeOptimiste] = useState(false);

  if (statut === "confirme" || confirmeOptimiste) {
    return (
      <Badge ton="ok" dot>
        {type === "CS" ? "Confirmé" : "Confirmée"}
      </Badge>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <Badge ton="warn">À confirmer</Badge>
      <Button
        size="sm"
        disabled={pending}
        title="Le conseil syndical a validé la date (retour de mail)"
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            const r = await confirmerEvenementAction(coproCode, type);
            if (!r.ok) setErreur(r.erreur);
            else setConfirmeOptimiste(true);
          });
        }}
      >
        Confirmer
      </Button>
      {erreur && <span className="text-[11px] text-err-700">{erreur}</span>}
    </span>
  );
}
