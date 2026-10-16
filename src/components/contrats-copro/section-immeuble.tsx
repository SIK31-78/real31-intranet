"use client";

// Section « Immeuble » de la fiche copro (REA-333, décision 7) : ce que le registre national
// des copropriétés demande sur l'immeuble, en lecture d'abord (surface, construction,
// chauffage, ECS, ventilation, diagnostics, PPT), un bouton « Modifier » qui ouvre le
// formulaire complet, et la liste des bâtiments éditable en place.
//
// L'agent de l'onglet la branche dans la vue d'ensemble :
//   <SectionImmeuble coproCode={code} fiche={await ficheImmeubleDe(code)} peutEcrire={…} />

import { useState } from "react";
import { Building2, Pencil } from "lucide-react";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataList, DataRow } from "@/components/ui/data-list";
import {
  champsManquantsImmeuble,
  formatJourFR,
  LIBELLE_PERIODE_CONSTRUCTION,
  LIBELLE_TRI_ETAT,
  libelleDe,
  QUESTIONS_TRI_ETAT,
  resumeChauffage,
  resumeEcs,
  resumeVentilation,
  type FicheImmeuble,
  type TriEtat,
} from "@/lib/domain/contrats-copro";
import { FormulaireImmeuble } from "./immeuble/formulaire-immeuble";
import { ListeBatiments } from "./immeuble/liste-batiments";

const A_RENSEIGNER = "à renseigner";

function Valeur({ children }: { children: string | null }) {
  return children ? <>{children}</> : <span className="font-normal text-ink-3">{A_RENSEIGNER}</span>;
}

function construction(f: FicheImmeuble): string | null {
  const periode = libelleDe(LIBELLE_PERIODE_CONSTRUCTION, f.periodeConstruction);
  if (f.anneeConstruction !== null && periode) return `${f.anneeConstruction} (${periode})`;
  if (f.anneeConstruction !== null) return String(f.anneeConstruction);
  return periode;
}

function ppt(f: FicheImmeuble): string | null {
  if (f.pptVote === "oui") return f.pptAdoptionISO ? `Voté, adopté le ${formatJourFR(f.pptAdoptionISO)}` : "Voté, date d'adoption à renseigner";
  if (f.pptVote === "non") {
    if (f.pptInscritAG === "oui") return "Non voté, projet inscrit à l'ordre du jour de l'AG";
    if (f.pptInscritAG === "non") return "Non voté, projet non inscrit à l'AG";
    return "Non voté";
  }
  return null;
}

function tonTriEtat(v: TriEtat | null): "ok" | "neutral" | "outline" {
  if (v === "oui") return "ok";
  if (v === "non") return "neutral";
  return "outline";
}

export function SectionImmeuble({ coproCode, fiche, peutEcrire }: { coproCode: string; fiche: FicheImmeuble; peutEcrire: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const manquants = champsManquantsImmeuble(fiche);
  const surface = fiche.surfaceM2 === null ? null : `${fiche.surfaceM2.toLocaleString("fr-FR")} m²`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Building2 strokeWidth={1.5} aria-hidden />
          Immeuble
          {manquants.length > 0 && (
            <Badge ton="warn" title={manquants.join(", ")}>
              {manquants.length} champ{manquants.length > 1 ? "s" : ""} à compléter
            </Badge>
          )}
        </CardTitle>
        {peutEcrire && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setOuvert(true)}>
            <Pencil strokeWidth={1.5} /> Modifier
          </Button>
        )}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
          <DataList align="left">
            <DataRow label="Surface">
              <Valeur>{surface}</Valeur>
            </DataRow>
            <DataRow label="Construction">
              <Valeur>{construction(fiche)}</Valeur>
            </DataRow>
            <DataRow label="Chauffage">
              <Valeur>{resumeChauffage(fiche)}</Valeur>
            </DataRow>
            <DataRow label="Eau chaude">
              <Valeur>{resumeEcs(fiche)}</Valeur>
            </DataRow>
            <DataRow label="Ventilation">
              <Valeur>{resumeVentilation(fiche)}</Valeur>
            </DataRow>
          </DataList>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {QUESTIONS_TRI_ETAT.map((q) => {
                const v = fiche[q.cle];
                return (
                  <Badge key={q.cle} ton={tonTriEtat(v)} title={q.libelle}>
                    {q.court} : {v ? LIBELLE_TRI_ETAT[v].toLowerCase() : A_RENSEIGNER}
                  </Badge>
                );
              })}
            </div>
            <DataList align="left">
              <DataRow label="PPT">
                <Valeur>{ppt(fiche)}</Valeur>
              </DataRow>
            </DataList>
            {fiche.notes && <p className="text-body text-ink-2 whitespace-pre-line">{fiche.notes}</p>}
          </div>
        </div>

        <ListeBatiments coproCode={coproCode} batiments={fiche.batiments} nombreBatiments={fiche.nombreBatiments} peutEcrire={peutEcrire} />

        <Callout ton="info" className="py-1.5">
          {"Ces données alimentent la déclaration au registre national des copropriétés, que l'intranet ne transmet pas encore."}
        </Callout>
      </CardBody>
      {ouvert && <FormulaireImmeuble fiche={fiche} onFermer={() => setOuvert(false)} />}
    </Card>
  );
}
