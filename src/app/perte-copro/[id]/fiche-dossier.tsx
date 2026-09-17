"use client";

// Fiche d'un dossier de perte : la checklist de la fiche process, par phase, avec pour
// chaque étape son statut, son échéance (depuis l'AG), qui s'en charge, une note, et la
// liste de contrôle quand la fiche en prévoit une. Mêmes codes que la fiche de reprise
// (pastille et tons partagés dans `components/suivi/statut-etape`) : blocage en rouge,
// étape « sans objet » barrée.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, OctagonAlert } from "lucide-react";
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
} from "@/lib/domain/perte/dossier";
import { avancement, etapeClose } from "@/lib/domain/suivi/etape";
import { PastilleEtape, classesLibelleStatut } from "@/components/suivi/statut-etape";
import { mettreAJourEtapeAction } from "../actions";

import { Journal } from "@/components/ui/journal";
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
        const { faites } = avancement(etapes);
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
              <Journal entrees={dossier.journal} />
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
  const close = etapeClose(etape.statut);

  return (
    <li className={cn("px-4 py-3 flex flex-col gap-2", etape.statut === "bloque" && "bg-err-50/40", pending && "opacity-70")}>
      <div className="flex items-start gap-3">
        <PastilleEtape statut={etape.statut} className="mt-0.5" />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className={cn("text-body", classesLibelleStatut(etape.statut))}>
            <span className="font-mono text-ink-3 mr-2">{etape.code}</span>
            {def.libelle}
          </p>
          <p className="text-meta text-ink-3 flex flex-wrap items-center gap-x-3 gap-y-1">
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
              <Button type="button" variant="ghost" size="sm" disabled={pending} title="Sans objet pour cette copropriété" onClick={() => onMaj({ statut: "ignore" })}>
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
          className="text-meta"
        />
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (etape.note ?? "") && onMaj({ note: note.trim() || null })}
          placeholder={etape.statut === "bloque" ? "Pourquoi c'est bloqué" : "Note"}
          className={cn("text-meta flex-1 min-w-48", etape.statut === "bloque" && !etape.note && "border-err-500")}
        />
        {etape.statut === "bloque" && <Badge ton="err" dot>bloqué</Badge>}
      </div>
    </li>
  );
}
