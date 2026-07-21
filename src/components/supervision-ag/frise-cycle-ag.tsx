// Frise du cycle AG en tete du fil d'AG (/supervision-ag/[agId], S1 refonte).
// Meme vocabulaire et meme design que le stepper de la fiche copro (BlocParcours).
//
// REGLE DU SOCLE (cf. domain/cycle-ag) : l'action affichee vient d'actionDuMoment,
// JAMAIS codee en dur. UN SEUL bouton primaire par ecran : si l'action du moment se
// joue AILLEURS (fiche, ODJ...), c'est elle le bouton primaire de la frise ; si elle
// se joue ICI (la supervision elle-meme), on ne rend qu'une mention neutre et le
// primaire de l'ecran reste "Conclure l'AG" (header, actif checklist complete).

import Link from "next/link";
import { ArrowRight, Route } from "lucide-react";
import { ETAT_CYCLE_LABEL, type CycleAg } from "@/lib/domain/cycle-ag";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FriseEtapes } from "@/components/parcours/frise-etapes";

export function FriseCycleAg({ cycle }: { cycle: CycleAg }) {
  const action = cycle.actionDuMoment;
  // L'action se joue-t-elle sur cet ecran (la supervision) ?
  const seJoueIci = action?.href.startsWith("/supervision-ag/") ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Route strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          Où en est cette AG
        </CardTitle>
        <div className="flex items-center gap-2">
          <Badge ton={cycle.etat === "tenue" ? "ok" : "outline"}>
            {ETAT_CYCLE_LABEL[cycle.etat]}
          </Badge>
          {cycle.echeance && (
            <Badge
              ton={cycle.enRetard ? "err" : cycle.echeance.startsWith("J-") ? "outline" : "warn"}
              className="font-mono"
              dot={cycle.enRetard}
            >
              {cycle.echeance}
            </Badge>
          )}
        </div>
      </CardHeader>
      <div className="px-4 py-3.5">
        <FriseEtapes etapes={cycle.etapes} />
        <div className="mt-3 flex items-center justify-between gap-3">
          {action ? (
            <p className="text-[12px] text-ink-3">
              Action du moment : <span className="text-ink-2">{action.action}</span>
              {seJoueIci && <span> — elle se joue ici, dans la checklist ci-dessous.</span>}
            </p>
          ) : (
            <p className="text-[12px] text-ink-3">
              Cycle terminé pour cet exercice — rien à faire avant la prochaine clôture.
            </p>
          )}
          {action && !seJoueIci && (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors shrink-0"
            >
              {action.label}
              <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
