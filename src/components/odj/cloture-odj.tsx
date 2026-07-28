"use client";

// Cloture de l'ODJ en "reunion terminee" (demande Sekou 2026-07-28) : le CS preparatoire
// s'est tenu, le document est fige, on passe a la supervision AG.
//
// Ce que ce bloc dit HONNETEMENT : la cloture ne diffuse RIEN. Le depot du compte rendu
// sur l'extranet reste un geste manuel tant que la generation de PDF + le depot eStale
// n'existent pas. On l'ecrit a l'ecran plutot que de laisser croire que c'est fait --
// et on ne coche surtout pas l'item de supervision correspondant a notre place.

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Lock, RotateCcw, ArrowRight, Printer } from "lucide-react";
import type { ClotureOdj } from "@/lib/domain/odj";
import { Button } from "@/components/ui/button";

function dateLisible(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

export function ClotureOdjBloc({
  id,
  cloture,
  supervisionId,
  onCloturer,
}: {
  id: string;
  cloture?: ClotureOdj;
  /** Id de supervision "CODE__YYYY-MM-DD" ; absent si aucune AG n'est datee. */
  supervisionId?: string;
  onCloturer: (clore: boolean) => Promise<void>;
}) {
  const [confirme, setConfirme] = useState(false);
  const [pending, demarrer] = useTransition();

  if (cloture) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-ok-500/30 bg-ok-50 px-3.5 py-3">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 strokeWidth={1.5} className="mt-px h-4 w-4 shrink-0 text-ok-700" />
          <div className="flex flex-col gap-0.5">
            <p className="text-[13px] font-medium text-ok-700">
              Réunion terminée - ordre du jour clôturé
            </p>
            <p className="text-[12px] text-ink-3">
              Clôturé le {dateLisible(cloture.le)}
              {cloture.par ? ` par ${cloture.par}` : ""}. Le document est figé : plus aucun champ
              n&apos;est modifiable.
            </p>
          </div>
        </div>
        {/* Le geste qui reste MANUEL, dit explicitement plutot que sous-entendu. */}
        <p className="text-[12px] text-ink-3">
          Le compte rendu n&apos;est pas encore déposé automatiquement sur l&apos;extranet :
          imprime le document et dépose-le, puis coche « Compte rendu CS diffusé sur
          l&apos;extranet » dans la supervision.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {supervisionId && (
            <Link
              href={`/supervision-ag/${supervisionId}`}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600 transition-colors"
            >
              Passer à la supervision AG
              <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
            </Link>
          )}
          <Link
            href={`/odj/${id}/imprimer`}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors"
          >
            <Printer strokeWidth={1.5} className="w-3.5 h-3.5" />
            Version imprimable
          </Link>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => demarrer(async () => { await onCloturer(false); })}
            title="Rouvrir l'ODJ (aucune diffusion n'a été engagée)"
          >
            <RotateCcw strokeWidth={1.5} />
            {pending ? "Réouverture..." : "Rouvrir"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-line bg-surface-2 px-3.5 py-3">
      <div className="flex items-start gap-2.5">
        <Lock strokeWidth={1.5} className="mt-px h-4 w-4 shrink-0 text-ink-3" />
        <div className="flex flex-col gap-0.5">
          <p className="text-[13px] font-medium text-ink">Le CS s&apos;est tenu ?</p>
          <p className="text-[12px] text-ink-3">
            Clôturer fige l&apos;ordre du jour et ouvre la supervision AG. Réversible : rien
            n&apos;est envoyé ni diffusé à cette étape.
          </p>
        </div>
      </div>
      <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={confirme}
          onChange={(e) => setConfirme(e.target.checked)}
        />
        <span>Je confirme que la réunion du conseil syndical a eu lieu.</span>
      </label>
      <div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          disabled={pending || !confirme}
          onClick={() => demarrer(async () => { await onCloturer(true); })}
        >
          <CheckCircle2 strokeWidth={1.5} />
          {pending ? "Clôture..." : "Marquer la réunion terminée"}
        </Button>
      </div>
    </div>
  );
}
