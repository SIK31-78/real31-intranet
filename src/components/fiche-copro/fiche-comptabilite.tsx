import Link from "next/link";
import { ArrowUpRight, ClipboardList, FileText } from "lucide-react";
import type { FicheCopro } from "@/lib/domain/copropriete";
import type { AuteurNote } from "@/lib/domain/compta";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ComptaChecklist } from "@/components/compta/compta-checklist";
import { ComptaPanel } from "@/components/compta/compta-panel";
import { formatDateLongue } from "@/lib/format-date";

// Onglet "Comptabilite" de la fiche (Sekou, 28/09/2026 : l'onglet etait verrouille).
// Deux blocs : la preparation des comptes de la PROCHAINE AG (le meme espace que
// /compta/<code>__<agDate>, deja charge par la fiche) et les recaps des AG passees.
// Les ecritures (cases, drapeaux, notes) re-verifient le perimetre cote action.
export function FicheComptabilite({ fiche, role }: { fiche: FicheCopro; role: AuteurNote }) {
  const code = fiche.copro.code;
  const agDate = fiche.copro.prochaineAg?.date;

  return (
    <div className="flex flex-col gap-5">
      {agDate && fiche.compta ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-body font-medium text-ink">Préparation des comptes · AG du {formatDateLongue(agDate)}</h2>
            <ButtonLink href={`/compta/${code}__${agDate}`} variant="ghost" size="sm">
              Pleine page <ArrowUpRight strokeWidth={1.5} />
            </ButtonLink>
          </div>
          <ComptaChecklist coproCode={code} agDateISO={agDate} checks={fiche.compta.checks} />
          <ComptaPanel coproCode={code} agDateISO={agDate} etat={fiche.compta} role={role} />
        </div>
      ) : (
        <EmptyState icone={ClipboardList}>
          Pas d&apos;AG datée : la préparation des comptes s&apos;ouvre dès que la date de la prochaine AG est fixée.
        </EmptyState>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Récaps d&apos;AG</CardTitle>
        </CardHeader>
        <CardBody>
          {fiche.recapsAg === undefined ? (
            <EmptyState compact>Récaps d&apos;AG momentanément illisibles</EmptyState>
          ) : fiche.recapsAg.length === 0 ? (
            <EmptyState compact>Aucun récap d&apos;AG saisi</EmptyState>
          ) : (
            <ul className="flex flex-col text-body">
              {fiche.recapsAg.map((r) => (
                <li key={r.id} className="min-h-8 flex items-center gap-2">
                  <FileText strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
                  <Link href={`/comptabilite/recaps/${r.id}`} className="text-ink hover:text-green-700 hover:underline">
                    AG du {formatDateLongue(r.agDate)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
