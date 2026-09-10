import { ArrowRight, Route } from "lucide-react";
import {
  peutConclure,
  estVerifie,
  progressionGlobale,
  type Role,
  type StatutItem,
  type SupervisionAg,
} from "@/lib/domain/supervision-ag";
import { ETAT_CYCLE_LABEL, type CycleAg } from "@/lib/domain/cycle-ag";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FriseEtapes } from "@/components/parcours/frise-etapes";
import { actionPrincipaleEcran } from "@/components/parcours/action-principale";
import { ConclureBouton } from "./conclure-bouton";

// LA bande d'en-tete de la supervision (refonte 2026-09) : titre, AG cible, etat,
// echeance, LE primaire de l'ecran, puis la frise du cycle et la progression - sur une
// seule carte au lieu de trois. L'action affichee vient d'actionPrincipaleEcran
// ("supervision"), JAMAIS codee en dur : si l'action du moment se joue ailleurs (ODJ,
// fiche), c'est elle le primaire et "Conclure" passe en secondaire ; sinon le primaire
// est "Conclure l'AG" (actif checklist complete, la raison est ecrite sous le bouton).

type SupervisionHeaderProps = {
  supervision: SupervisionAg;
  cycle: CycleAg | null;
  role: Role;
  onConclure: () => Promise<void>;
};

const RAISONS = {
  role: "Seul le gestionnaire de la copro peut conclure",
  probleme: "Des items sont en Problème : à résoudre avant de conclure",
  incomplet: "Checklist incomplète : traiter tous les items avant de conclure",
} as const;

function calculRaisonDisabled(supervision: SupervisionAg, role: Role): keyof typeof RAISONS | null {
  if (role !== "gestionnaire") return "role";
  const items = supervision.sections.flatMap((s) => s.items);
  if (items.some((i) => i.statut === "probleme")) return "probleme";
  if (!items.every(estVerifie)) return "incomplet";
  return null;
}

function compterParStatut(supervision: SupervisionAg): Record<StatutItem, number> {
  const acc: Record<StatutItem, number> = { ok: 0, probleme: 0, non_applicable: 0, non_verifie: 0 };
  for (const s of supervision.sections) for (const i of s.items) acc[i.statut]++;
  return acc;
}

const POINTS: Record<"ok" | "err" | "neutral" | "ghost", string> = {
  ok: "bg-ok-500",
  err: "bg-err-500",
  neutral: "bg-ink-3",
  ghost: "bg-line-2",
};

function Repartition({ label, count, ton }: { label: string; count: number; ton: keyof typeof POINTS }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body text-ink-2">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${POINTS[ton]}`} aria-hidden />
      <span className="text-ink font-medium tabular-nums">{count}</span>
      {label}
    </span>
  );
}

export function SupervisionHeader({ supervision, cycle, role, onConclure }: SupervisionHeaderProps) {
  const concluable = peutConclure(supervision, role);
  const dejaConclue = supervision.statut === "conclue_archivee";
  const raison = calculRaisonDisabled(supervision, role);
  const action = actionPrincipaleEcran(cycle, "supervision", {
    coproCode: supervision.copro.code,
    supervisionConclue: dejaConclue,
  });
  // Le primaire se joue ailleurs -> on y va ; "Conclure" reste disponible en secondaire.
  const conclureEstPrimaire = action?.locale === "conclure-ag";
  const progression = progressionGlobale(supervision);
  const counts = compterParStatut(supervision);

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-page font-semibold tracking-tight text-ink">
                Supervision AG : {supervision.copro.nomCourt}
              </h1>
              <span className="font-mono text-body text-ink-2">{supervision.copro.code}</span>
              {cycle && <Badge ton={cycle.etat === "tenue" ? "ok" : "outline"}>{ETAT_CYCLE_LABEL[cycle.etat]}</Badge>}
              {cycle?.echeance && (
                <Badge
                  ton={cycle.enRetard ? "err" : cycle.echeance.startsWith("J-") ? "outline" : "warn"}
                  dot={cycle.enRetard}
                  title={`Échéance de l'étape en cours${cycle.enRetard ? " (en retard)" : ""}`}
                >
                  {cycle.echeance}
                </Badge>
              )}
            </div>
            <p className="text-body text-ink-2">
              AG cible : <span className="text-ink font-medium tabular-nums">{supervision.dateAgCible}</span>
            </p>
          </div>
          {!dejaConclue && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <div className="flex items-center gap-2">
                <ConclureBouton
                  disabled={!concluable}
                  variant={conclureEstPrimaire ? "primary" : "secondary"}
                  onConclure={onConclure}
                />
                {action?.href && (
                  <ButtonLink href={action.href} variant="primary">
                    {action.label}
                    <ArrowRight strokeWidth={1.5} />
                  </ButtonLink>
                )}
              </div>
              {raison && <p className="text-meta text-ink-2">{RAISONS[raison]}</p>}
            </div>
          )}
        </div>

        {cycle && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <FriseEtapes etapes={cycle.etapes} />
            <p className="text-body text-ink-2 flex items-center gap-1.5">
              <Route strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" aria-hidden />
              {cycle.actionDuMoment ? (
                <>
                  Action du moment : <span className="text-ink font-medium">{cycle.actionDuMoment.action}</span>
                  {conclureEstPrimaire && !dejaConclue && <span>(elle se joue ici, dans la checklist)</span>}
                </>
              ) : (
                "Cycle terminé pour cet exercice : rien à faire avant la prochaine clôture."
              )}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-title font-semibold text-ink tabular-nums">{progression.pourcentage} %</span>
            <span className="text-body text-ink-2 tabular-nums">
              {progression.verifies} vérifiés sur {progression.total}
            </span>
            <span className="flex items-center gap-4 ml-auto">
              <Repartition label="OK" count={counts.ok} ton="ok" />
              <Repartition label="Problème" count={counts.probleme} ton="err" />
              <Repartition label="N/A" count={counts.non_applicable} ton="neutral" />
              <Repartition label="Restant" count={counts.non_verifie} ton="ghost" />
            </span>
          </div>
          <Progress valeur={progression.pourcentage} label={`Progression : ${progression.pourcentage} %`} />
        </div>
      </CardBody>
    </Card>
  );
}
