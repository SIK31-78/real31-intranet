"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StatutConfirmation } from "@/lib/domain/confirmation-evenement";
import { confirmerEvenementAction } from "./dates-actions";

/** Fin proposee par defaut : debut + 2 h (duree usuelle d'un CS). Vide si pas d'heure de
 *  debut connue - on ne devine pas une fin sans point de depart. */
function finProposee(heureDebut?: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(heureDebut ?? "");
  if (!m) return "";
  const h = (Number(m[1]) + 2) % 24;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Confirmation d'une prochaine date AG/CS (demande patron) : la date posee est
// proposee au conseil syndical par mail -> badge "A confirmer" + bouton "Confirmer".
// Au retour de mail, le gestionnaire confirme -> badge "Confirmee". Replanifier la
// date reinitialise la confirmation (regle du domaine, statutPourDate).
// N'est rendu que pour une date FUTURE (le service ne pose pas de statut sinon).
export function ConfirmationEvenement({
  coproCode,
  type,
  statut,
  heureDebut,
}: {
  coproCode: string;
  type: "AG" | "CS";
  statut: StatutConfirmation;
  /** Heure de debut planifiee ("HH:mm"), pour proposer une fin par defaut. CS seulement. */
  heureDebut?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Heure de FIN reelle du CS, saisie ICI (demande Sekou 2026-07-28) : c'est le seul
  // moment ou le gestionnaire l'a en tete. Elle pre-remplira la facturation du
  // depassement d'honoraires depuis la supervision, au lieu d'etre retrouvee de memoire
  // des semaines plus tard. Facultative : confirmer sans elle reste possible.
  const [heureFin, setHeureFin] = useState(() => finProposee(heureDebut));
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
      {/* CS uniquement : l'heure de fin reelle. Une AG n'est pas facturee au temps passe. */}
      {type === "CS" && (
        <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
          fin
          <input
            type="time"
            value={heureFin}
            disabled={pending}
            aria-label="Heure de fin réelle du conseil syndical"
            onChange={(e) => setHeureFin(e.target.value)}
            className="h-7 px-1.5 rounded-sm border border-line bg-surface text-[12px] text-ink disabled:opacity-50"
            title="Heure de fin réelle : pré-remplira la facturation des honoraires CS"
          />
        </label>
      )}
      <Button
        size="sm"
        disabled={pending}
        title="Le conseil syndical a validé la date (retour de mail)"
        onClick={() => {
          setErreur(null);
          startTransition(async () => {
            const r = await confirmerEvenementAction(
              coproCode,
              type,
              type === "CS" && heureFin ? heureFin : undefined,
            );
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
