"use client";

// « Perdre une copropriété » (Sekou, 15/09/2026) : la passer INACTIVE au référentiel
// partagé, avec la date de fin de gestion et le motif. Elle sort aussitôt de la
// facturation, des alertes et des listes.
//
// Le code se retape pour confirmer : ce n'est pas irréversible (le patron peut la
// réactiver dans App A), mais une copro perdue par erreur disparaît de tout l'intranet
// pendant ce temps, et personne ne le voit.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Rows, Row } from "@/components/ui/list-rows";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import { perdreCoproAction } from "@/app/gestion-courante/actions";
import type { CoproPerdue } from "@/lib/ports/copro-repository";

export function PerdreCopro({
  copros,
  perdues,
  aujourdhuiISO,
}: {
  /** Copros ACTIVES du cabinet, par code. */
  copros: { code: string; nom: string }[];
  /** Les dernières pertes actées. */
  perdues: CoproPerdue[];
  aujourdhuiISO: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [code, setCode] = useState("");
  const [fin, setFin] = useState(aujourdhuiISO);
  const [motif, setMotif] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const copro = copros.find((c) => c.code === code);
  const pret = Boolean(copro) && /^\d{4}-\d{2}-\d{2}$/.test(fin) && confirmation.trim().toUpperCase() === code.toUpperCase();

  function perdre() {
    demarrer(async () => {
      const res = await perdreCoproAction({ coproCode: code, finGestionISO: fin, motif, confirmation });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${code} ${copro?.nom ?? ""} est passée inactive : elle ne sera plus facturée.`);
      setCode("");
      setMotif("");
      setConfirmation("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Copropriété" htmlFor="perte-copro">
          <Select id="perte-copro" value={code} onChange={(e) => { setCode(e.target.value); setConfirmation(""); }}>
            <option value="">Choisir…</option>
            {copros.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.nom}</option>
            ))}
          </Select>
        </Field>
        <Field label="Dernier jour géré" htmlFor="perte-fin">
          <Input id="perte-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </Field>
        <Field label="Motif (facultatif)" htmlFor="perte-motif" className="sm:col-span-2">
          <Textarea id="perte-motif" rows={2} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Changement de syndic, vente de l'immeuble, fin de mandat non renouvelé…" />
        </Field>
      </div>
      {copro && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Retaper « ${copro.code} » pour confirmer`} htmlFor="perte-confirm">
            <Input id="perte-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} largeur="auto" className="font-mono" autoComplete="off" />
          </Field>
          <Button type="button" variant="primary" disabled={!pret || pending} onClick={perdre}>
            {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <LogOut strokeWidth={1.5} />}
            Perdre {copro.code}
          </Button>
        </div>
      )}
      <p className="text-body text-ink-2">
        La copropriété passe <span className="font-medium">inactive</span> dans le référentiel : elle sort de la
        facturation de gestion courante, des alertes et des listes. Le dernier trimestre géré n&apos;est pas
        facturé automatiquement au prorata : le faire partir avant de la perdre, ou le facturer à la main.
      </p>
      {perdues.length > 0 && (
        <Rows>
          {perdues.map((p) => (
            <Row
              key={`${p.coproCode}-${p.creeLeISO}`}
              avant={p.coproCode}
              principal={p.coproNom}
              secondaire={
                <>
                  Gérée jusqu&apos;au {formatDateLongue(p.finGestionISO)}
                  {p.motif ? ` · ${p.motif}` : ""} · acté par {p.par} le {formatDateLongue(p.creeLeISO)}
                </>
              }
            />
          ))}
        </Rows>
      )}
    </div>
  );
}
