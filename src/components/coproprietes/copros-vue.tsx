"use client";

// Pilotage du portefeuille : bascule Liste / Pipeline (kanban par etat du cycle AG).
// Filtres etat / exercice. Decision Sekou 2026-06-22 (cockpit) ; le filtre SOURCE
// (Crypto / ESTALE) a ete retire le 2026-09-10 : la source est une affaire de
// plomberie interne, pas un critere de travail du gestionnaire.
//
// Refonte 2026-09 : la liste est un tableau dense (36 px), le kanban des lignes
// compactes sans badge de source repete 249 fois, la bascule de vue et les filtres
// sont neutres. UN primaire sur la page : "Tout prendre en main" (quand il y a des
// copros a prendre en main) ; les lignes du bac ont leur bouton en secondaire.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { List, LayoutGrid, Search, ClipboardCheck, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";
import { Rows, Row } from "@/components/ui/list-rows";
import { EmptyState } from "@/components/ui/empty-state";
import { Aide } from "@/components/ui/aide";
import { useToast } from "@/components/ui/toast";
import { ETAT_CYCLE_LABEL, ETAT_CYCLE_ORDRE, type EtatCycle } from "@/lib/domain/etat-cycle-ag";
import type { CoproPilotage } from "@/lib/services/coproprietes/get-copros-pilotage";
import { prendreEnMainAction, prendreEnMainLotAction } from "@/app/copropriete/actions";

const ETAT_TON: Record<EtatCycle, BadgeTon> = {
  a_planifier: "neutral",
  a_venir: "neutral",
  en_preparation: "warn",
  convoquee: "info",
  tenue: "ok",
};

function echeance(c: CoproPilotage): string {
  if (c.etat === "a_planifier") return c.enRetard ? "en retard" : "à planifier";
  if (c.etat === "tenue") return "suivi post-AG";
  if (c.agDate) return `AG ${c.agDate.slice(8, 10)}/${c.agDate.slice(5, 7)}`;
  return "-";
}

function rangCloture(c: string): number {
  const [j, m] = c.split("/").map(Number);
  return m * 100 + j;
}

type Vue = "liste" | "pipeline";

export function CoprosVue({
  copros,
  etatInitial,
}: {
  copros: CoproPilotage[];
  etatInitial?: EtatCycle;
}) {
  const [vue, setVue] = useState<Vue>(etatInitial ? "liste" : "pipeline");
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState<"all" | EtatCycle>(etatInitial ?? "all");
  const [cloture, setCloture] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Onboarding : copros confirmees (cockpit actif) vs a prendre en main (bac calme).
  const actives = useMemo(() => copros.filter((c) => c.prise), [copros]);
  const aPrendre = useMemo(() => copros.filter((c) => !c.prise), [copros]);

  const prendre = (codes: string[]) =>
    startTransition(async () => {
      const res = codes.length === 1 ? await prendreEnMainAction(codes[0]!) : await prendreEnMainLotAction(codes);
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(codes.length > 1 ? `${codes.length} copropriétés prises en main.` : "Copropriété prise en main.");
    });

  const clotures = useMemo(
    () =>
      Array.from(new Set(actives.map((c) => c.exerciceCloture).filter((x): x is string => Boolean(x)))).sort(
        (a, b) => rangCloture(a) - rangCloture(b),
      ),
    [actives],
  );

  const filtrees = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return actives.filter((c) => {
      if (etat !== "all" && c.etat !== etat) return false;
      if (cloture && c.exerciceCloture !== cloture) return false;
      if (
        terme &&
        !(
          c.code.toLowerCase().includes(terme) ||
          c.nom.toLowerCase().includes(terme) ||
          c.ville.toLowerCase().includes(terme)
        )
      )
        return false;
      return true;
    });
  }, [actives, q, etat, cloture]);

  const parEtat = useMemo(() => {
    const m: Record<EtatCycle, CoproPilotage[]> = {
      a_planifier: [],
      a_venir: [],
      en_preparation: [],
      convoquee: [],
      tenue: [],
    };
    for (const c of filtrees) m[c.etat].push(c);
    return m;
  }, [filtrees]);

  const filtre = etat !== "all" || Boolean(cloture) || q.trim() !== "";

  return (
    <div className="flex flex-col gap-4">
      {aPrendre.length > 0 && (
        <PriseEnMainSection copros={aPrendre} pending={pending} onPrendre={prendre} />
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (code, nom, ville)…"
            aria-label="Rechercher une copropriété"
            className="pl-8"
          />
        </div>
        <Select largeur="auto" aria-label="État du cycle" value={etat} onChange={(e) => setEtat(e.target.value as typeof etat)}>
          <option value="all">Tous les états</option>
          {ETAT_CYCLE_ORDRE.map((e) => (
            <option key={e} value={e}>
              {ETAT_CYCLE_LABEL[e]}
            </option>
          ))}
        </Select>
        {clotures.length > 1 && (
          <Select largeur="auto" aria-label="Clôture d'exercice" value={cloture} onChange={(e) => setCloture(e.target.value)}>
            <option value="">Tout exercice</option>
            {clotures.map((c) => (
              <option key={c} value={c}>
                Clôt. {c}
              </option>
            ))}
          </Select>
        )}
        <span className="text-body text-ink-2 tabular-nums">
          {filtrees.length} copropriété{filtrees.length > 1 ? "s" : ""}
          {filtre ? ` sur ${actives.length}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <SegmentedControl<Vue>
            label="Vue"
            value={vue}
            onChange={(v) => setVue(v ?? "liste")}
            options={[
              { value: "liste", label: "Liste" },
              { value: "pipeline", label: "Pipeline" },
            ]}
          />
          <span className="text-ink-3" aria-hidden>
            {vue === "liste" ? <List strokeWidth={1.5} className="w-4 h-4" /> : <LayoutGrid strokeWidth={1.5} className="w-4 h-4" />}
          </span>
        </span>
      </div>

      {vue === "liste" ? <VueListe copros={filtrees} /> : <VuePipeline parEtat={parEtat} />}
    </div>
  );
}

function VueListe({ copros }: { copros: CoproPilotage[] }) {
  if (copros.length === 0) {
    return <EmptyState>Aucune copropriété pour ces filtres</EmptyState>;
  }
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Code</Th>
          <Th>Copropriété</Th>
          <Th className="hidden md:table-cell">Ville</Th>
          <Th>État</Th>
          <Th numeric>Échéance</Th>
        </tr>
      </Thead>
      <Tbody>
        {copros.map((c) => (
          <Tr key={c.code} interactive ton={c.etat === "a_planifier" && c.enRetard ? "err" : undefined}>
            <Td code>{c.code}</Td>
            <Td principal>
              <LienLigne href={`/copropriete/${c.code}`}>{c.nom}</LienLigne>
            </Td>
            <Td secondaire className="hidden md:table-cell">{c.ville}</Td>
            <Td>
              <Badge ton={c.etat === "a_planifier" && c.enRetard ? "err" : ETAT_TON[c.etat]} dot>
                {ETAT_CYCLE_LABEL[c.etat]}
              </Badge>
            </Td>
            <Td numeric secondaire={!(c.etat === "a_planifier" && c.enRetard)} className={cn(c.etat === "a_planifier" && c.enRetard && "text-err-700 font-medium")}>
              {echeance(c)}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

function VuePipeline({ parEtat }: { parEtat: Record<EtatCycle, CoproPilotage[]> }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
      {ETAT_CYCLE_ORDRE.map((etat) => (
        <Card key={etat}>
          <CardHeader>
            <CardTitle>{ETAT_CYCLE_LABEL[etat]}</CardTitle>
            <span className="text-body text-ink-2 tabular-nums">{parEtat[etat].length}</span>
          </CardHeader>
          {parEtat[etat].length === 0 ? (
            <CardBody padding="sm">
              <EmptyState compact>Aucune copropriété</EmptyState>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {parEtat[etat].map((c) => {
                const retard = c.etat === "a_planifier" && c.enRetard;
                return (
                  <li key={c.code}>
                    <Link
                      href={`/copropriete/${c.code}`}
                      className="flex flex-col gap-0.5 px-3 py-1.5 min-h-9 text-body hover:bg-surface-2/60 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
                    >
                      <span className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono text-ink-2 shrink-0">{c.code}</span>
                        <span className="font-medium text-ink truncate">{c.nom}</span>
                      </span>
                      <span className={cn("text-meta tabular-nums", retard ? "text-err-700 font-medium" : "text-ink-2")}>{echeance(c)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function fmtDate(iso?: string): string {
  return iso ? iso.split("-").reverse().join("/") : "-";
}

// Bac d'onboarding : copros aux dates heritees non encore validees. Calme, sans alarme.
function PriseEnMainSection({
  copros,
  pending,
  onPrendre,
}: {
  copros: CoproPilotage[];
  pending: boolean;
  onPrendre: (codes: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <ClipboardCheck strokeWidth={1.5} className="text-warn-700" />
          À prendre en main
          <span className="font-normal text-ink-2 tabular-nums">{copros.length}</span>
        </CardTitle>
        <span className="flex items-center gap-3">
          <Aide titre="Pourquoi">
            Ces copropriétés portent des dates héritées de la migration, souvent fausses. Vérifiez-les puis confirmez :
            tant qu&apos;une copro n&apos;est pas prise en main, elle ne déclenche aucune alarme.
          </Aide>
          <Button variant="primary" size="sm" loading={pending} onClick={() => onPrendre(copros.map((c) => c.code))}>
            <Check strokeWidth={2} />
            Tout prendre en main
          </Button>
        </span>
      </CardHeader>
      <Rows encadre={false}>
        {copros.map((c) => (
          <Row
            key={c.code}
            avant={c.code}
            principal={c.nom}
            secondaire={`Dern. AG ${fmtDate(c.derniereAgDate)} · Proch. AG ${fmtDate(c.agDate)}`}
            droite={
              <>
                <ButtonLink href={`/copropriete/${c.code}`} variant="ghost" size="sm">
                  Vérifier
                </ButtonLink>
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => onPrendre([c.code])}>
                  <Check strokeWidth={2} /> Prendre en main
                </Button>
              </>
            }
          />
        ))}
      </Rows>
    </Card>
  );
}
