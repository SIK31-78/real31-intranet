// Bloc « copros ESTALE absentes du referentiel » (REA-407). Elles s'affichent partout dans
// l'intranet, mais la gestion courante part du referentiel et de son contrat : sans ligne,
// pas de facture. Rouge, parce que c'est de l'argent qui ne rentre pas.
//
// Deux contextes : l'ecran Gestion courante (« ne partiront pas dans la fournee ») et
// l'accueil de ceux qui facturent. Rien quand la liste est vide. Si le controle n'a pas pu
// se faire, l'ecran de facturation le dit (on ne peut pas promettre une fournee complete),
// l'accueil se tait.

import { AlertTriangle } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { Aide } from "@/components/ui/aide";
import { Callout } from "@/components/ui/callout";
import type { EtatHorsReferentiel } from "@/lib/services/facturation/copros-hors-referentiel";

export function AlerteHorsReferentiel({
  etat,
  contexte,
}: {
  etat: EtatHorsReferentiel;
  contexte: "fournee" | "accueil";
}) {
  if (!etat.controle) {
    if (contexte === "accueil") return null;
    return (
      <Callout ton="warn" titre="Copropriétés ESTALE non contrôlées.">
        ESTALE n&apos;a pas répondu : impossible de vérifier qu&apos;aucune copropriété ESTALE ne manque à cette
        fournée. Rechargez la page dans quelques minutes.
      </Callout>
    );
  }
  if (etat.copros.length === 0) return null;
  const n = etat.copros.length;

  return (
    <section aria-labelledby="hors-referentiel" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2
          id="hors-referentiel"
          className="flex items-center gap-2 text-title font-semibold tracking-tight text-err-700"
        >
          <AlertTriangle strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden />
          {contexte === "fournee"
            ? `Copropriété${n > 1 ? "s" : ""} ESTALE absente${n > 1 ? "s" : ""} de cette fournée`
            : `Copropriété${n > 1 ? "s" : ""} ESTALE jamais facturée${n > 1 ? "s" : ""}`}
          <span className="text-body font-normal tabular-nums">{n}</span>
        </h2>
        <Aide titre="Pourquoi cette alerte">
          Ces copropriétés existent dans ESTALE mais n&apos;ont pas de ligne dans le référentiel de
          l&apos;intranet. La gestion courante part de cette ligne et de son contrat : sans elle, aucune
          facture ne part. Il faut créer la copropriété et son contrat dans le référentiel ; elle sort
          d&apos;ici dès que c&apos;est fait.
        </Aide>
      </div>
      <Rows>
        {etat.copros.map((c) => (
          <Row
            key={c.code}
            href={`/copropriete/${encodeURIComponent(c.code)}`}
            ton="err"
            avant={c.code}
            principal={c.nom}
            secondaire="Pas de ligne au référentiel ni de contrat"
            droite={
              <Badge ton="err" dot>
                non facturée
              </Badge>
            }
          />
        ))}
      </Rows>
    </section>
  );
}
