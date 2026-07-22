"use client";

// Checklist de verification des comptes d'une AG : les postes (POSTES_COMPTA) avec un
// statut cliquable par poste (a verifier / ok / a revoir / n/a), plus la progression.
// Le statut vit dans intranet_odj_champs (champ_id "compta.check.<slug>") via setCheckAction.
// Le "feu vert" final (flag comptes_verifies) reste explicite, cote ComptaPanel.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChecksCompta, StatutPoste } from "@/lib/domain/compta";
import { POSTES_COMPTA, progressionChecklist, statutPoste } from "@/lib/domain/compta";
import { setCheckAction } from "@/app/compta/actions";

const STATUTS: { valeur: StatutPoste; libelle: string }[] = [
  { valeur: "a_verifier", libelle: "À vérifier" },
  { valeur: "ok", libelle: "OK" },
  { valeur: "a_revoir", libelle: "À revoir" },
  { valeur: "non_applicable", libelle: "N/A" },
];

// Couleur du segment ACTIF selon le statut (le design system : ok=vert, warn=ambre).
function classeActif(statut: StatutPoste): string {
  switch (statut) {
    case "ok":
      return "bg-ok-50 text-ok-700 border-ok-500/40";
    case "a_revoir":
      return "bg-warn-50 text-warn-700 border-warn-500/40";
    case "non_applicable":
      return "bg-surface-2 text-ink-2 border-line-2";
    default:
      return "bg-surface text-ink-2 border-line-2";
  }
}

export function ComptaChecklist({
  coproCode,
  agDateISO,
  checks,
}: {
  coproCode: string;
  agDateISO: string;
  checks: ChecksCompta;
}) {
  const router = useRouter();
  const [pending, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  const prog = progressionChecklist(checks);

  function poser(slug: string, statut: StatutPoste) {
    setErreur(null);
    demarrer(async () => {
      const r = await setCheckAction(coproCode, agDateISO, slug, statut);
      if (r.ok) router.refresh();
      else setErreur(r.erreur ?? "Erreur.");
    });
  }

  return (
    <Card>
      <div className="px-3 py-2 border-b border-line flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">
          Postes à vérifier
        </span>
        <div className="flex items-center gap-2">
          {pending && <Loader2 strokeWidth={2} className="w-3.5 h-3.5 animate-spin text-ink-3" />}
          {prog.aRevoir > 0 && <Badge ton="warn" dot>{prog.aRevoir} à revoir</Badge>}
          <Badge ton={prog.traites === prog.total ? "ok" : "neutral"}>
            {prog.traites}/{prog.total} vérifiés
          </Badge>
        </div>
      </div>

      <ul className="divide-y divide-line">
        {POSTES_COMPTA.map((poste) => {
          const actif = statutPoste(checks, poste.slug);
          return (
            <li key={poste.slug} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <span className={`text-[13px] min-w-0 ${actif === "non_applicable" ? "text-ink-3" : "text-ink"}`}>
                {poste.libelle}
              </span>
              <div className="inline-flex shrink-0 rounded-md border border-line overflow-hidden">
                {STATUTS.map((s) => {
                  const estActif = actif === s.valeur;
                  return (
                    <button
                      key={s.valeur}
                      type="button"
                      onClick={() => !estActif && poser(poste.slug, s.valeur)}
                      disabled={pending}
                      aria-pressed={estActif}
                      className={`px-2 py-1 text-[11.5px] font-medium border-l first:border-l-0 border-line transition-colors disabled:opacity-60 ${
                        estActif ? classeActif(s.valeur) : "bg-surface text-ink-3 hover:bg-surface-2"
                      }`}
                    >
                      {s.libelle}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {erreur && (
        <p role="alert" className="px-3 py-2 text-[12px] text-err-700">
          {erreur}
        </p>
      )}
    </Card>
  );
}
