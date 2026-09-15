"use client";

// Fiche d'un dossier de perte : la checklist de la fiche process, par phase, avec pour
// chaque étape son statut, son échéance (depuis l'AG), qui s'en charge, une note, et la
// liste de contrôle quand la fiche en prévoit une. Mêmes codes que la fiche de reprise :
// pastille par statut, blocage en rouge, étape « sans objet » barrée.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, Minus, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Section } from "@/components/ui/section";
import { formatDateLongue } from "@/lib/format-date";
import {
  definitionEtape,
  echeanceEtape,
  ETAPES_PERTE,
  LIBELLE_PHASE,
  LIBELLE_ROLE,
  PHASES_PERTE,
  retardEtape,
  type DossierPerte,
  type EtapePerte,
  type StatutEtape,
} from "@/lib/domain/perte/dossier";
import { mettreAJourEtapeAction } from "../actions";

export function FicheDossierPerte({
  dossier,
  aujourdhuiISO,
  moi,
}: {
  dossier: DossierPerte;
  aujourdhuiISO: string;
  moi: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();

  function maj(code: string, patch: Record<string, unknown>) {
    demarrer(async () => {
      const res = await mettreAJourEtapeAction({ dossierId: dossier.id, code, ...patch });
      if (!res.ok) return toast.err(res.erreur);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {PHASES_PERTE.map((phase) => {
        const defs = ETAPES_PERTE.filter((d) => d.phase === phase);
        const etapes = defs.map((d) => dossier.etapes.find((e) => e.code === d.code) ?? { code: d.code, statut: "a_faire" as const });
        const faites = etapes.filter((e) => e.statut === "fait" || e.statut === "sans_objet").length;
        return (
          <Section key={phase} id={`phase-${phase.toLowerCase()}`} titre={`${LIBELLE_PHASE[phase]} · ${faites}/${etapes.length}`}>
            <Card>
              <ul className="divide-y divide-line">
                {etapes.map((etape) => (
                  <LigneEtape
                    key={etape.code}
                    dossier={dossier}
                    etape={etape}
                    aujourdhuiISO={aujourdhuiISO}
                    moi={moi}
                    pending={pending}
                    onMaj={(patch) => maj(etape.code, patch)}
                  />
                ))}
              </ul>
            </Card>
          </Section>
        );
      })}

      {dossier.journal.length > 0 && (
        <Section id="perte-journal" titre="Journal" compte={dossier.journal.length}>
          <Card>
            <CardBody>
              <ul className="flex flex-col gap-1 text-body">
                {[...dossier.journal].reverse().map((j, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-ink-3 tabular-nums shrink-0">{formatDateLongue(j.quandISO.slice(0, 10))}</span>
                    <span className="text-ink-2 shrink-0">{j.par}</span>
                    <span>{j.texte}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      )}
    </div>
  );
}

function LigneEtape({
  dossier,
  etape,
  aujourdhuiISO,
  moi,
  pending,
  onMaj,
}: {
  dossier: DossierPerte;
  etape: EtapePerte;
  aujourdhuiISO: string;
  moi: string;
  pending: boolean;
  onMaj: (patch: Record<string, unknown>) => void;
}) {
  const def = definitionEtape(etape.code)!;
  const echeance = echeanceEtape(dossier.dateAgISO, etape.code);
  const retard = retardEtape(dossier, etape, aujourdhuiISO);
  const [note, setNote] = useState(etape.note ?? "");
  const [assigne, setAssigne] = useState(etape.assigneA ?? "");
  const close = etape.statut === "fait" || etape.statut === "sans_objet";

  return (
    <li className={cn("px-4 py-3 flex flex-col gap-2", etape.statut === "bloque" && "bg-err-50/40", pending && "opacity-70")}>
      <div className="flex items-start gap-3">
        <Pastille statut={etape.statut} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p
            className={cn(
              "text-body",
              etape.statut === "fait" && "text-ink-2",
              etape.statut === "en_cours" && "text-info-700 font-medium",
              etape.statut === "bloque" && "text-err-700 font-medium",
              etape.statut === "sans_objet" && "text-ink-3 line-through",
            )}
          >
            <span className="font-mono text-ink-3 mr-2">{etape.code}</span>
            {def.libelle}
          </p>
          <p className="text-caption text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{LIBELLE_ROLE[def.role]}</span>
            {echeance && (
              <span className={cn(retard !== null && "text-warn-700 font-medium")}>
                pour le {formatDateLongue(echeance)}
                {retard !== null && ` · ${retard} j de retard`}
              </span>
            )}
            {etape.faitLeISO && <span>fait le {formatDateLongue(etape.faitLeISO)}</span>}
            {etape.assigneA && <span>· {etape.assigneA}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!close && (
            <>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onMaj({ statut: "en_cours", assigneA: etape.assigneA ?? moi })}>
                Je m&apos;en occupe
              </Button>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => onMaj({ statut: "fait" })}>
                <Check strokeWidth={2} /> Fait
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} title="Bloqué : préciser pourquoi dans la note" onClick={() => onMaj({ statut: "bloque" })}>
                <OctagonAlert strokeWidth={1.5} />
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={pending} title="Sans objet pour cette copropriété" onClick={() => onMaj({ statut: "sans_objet" })}>
                <Minus strokeWidth={1.5} />
              </Button>
            </>
          )}
          {close && (
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => onMaj({ statut: "a_faire" })}>
              Rouvrir
            </Button>
          )}
        </div>
      </div>

      {def.controles && (
        <ul className="ml-8 grid grid-cols-1 gap-1 sm:grid-cols-2">
          {def.controles.map((c) => (
            <li key={c}>
              <label className="inline-flex items-start gap-2 text-body cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-green-700 mt-1"
                  checked={etape.controles?.[c] === true}
                  disabled={pending}
                  onChange={(e) => onMaj({ controle: { libelle: c, coche: e.target.checked } })}
                />
                <span className={cn(etape.controles?.[c] && "text-ink-2 line-through")}>{c}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="ml-8 flex flex-wrap items-center gap-2">
        <Input
          value={assigne}
          onChange={(e) => setAssigne(e.target.value)}
          onBlur={() => assigne.trim() !== (etape.assigneA ?? "") && onMaj({ assigneA: assigne.trim() || null })}
          placeholder="Qui s'en charge"
          largeur="auto"
          className="text-caption"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (etape.note ?? "") && onMaj({ note: note.trim() || null })}
          placeholder={etape.statut === "bloque" ? "Pourquoi c'est bloqué" : "Note"}
          className={cn("text-caption flex-1 min-w-48", etape.statut === "bloque" && !etape.note && "border-err-500")}
        />
        {etape.statut === "bloque" && <Badge ton="err" dot>bloqué</Badge>}
      </div>
    </li>
  );
}

function Pastille({ statut }: { statut: StatutEtape }) {
  const base = "rounded-full flex items-center justify-center shrink-0 w-5 h-5 mt-0.5";
  if (statut === "fait") return <span className={cn(base, "bg-ok-500 text-white")} aria-hidden><Check strokeWidth={3} className="w-3 h-3" /></span>;
  if (statut === "en_cours") return <span className={cn(base, "bg-surface border-2 border-info-500 text-info-700")} aria-hidden><Circle strokeWidth={0} className="w-2 h-2 fill-info-500" /></span>;
  if (statut === "bloque") return <span className={cn(base, "bg-err-500 text-white")} aria-hidden><OctagonAlert strokeWidth={2.5} className="w-3 h-3" /></span>;
  if (statut === "sans_objet") return <span className={cn(base, "bg-surface-2 border border-line text-ink-3")} aria-hidden><Minus strokeWidth={2} className="w-3 h-3" /></span>;
  return <span className={cn(base, "bg-surface border border-line-2")} aria-hidden />;
}
