"use client";

// « Perdre une copropriété » (Sekou, 15/09/2026) : ouvre le dossier de perte — la
// checklist de la fiche process, datée depuis l'AG qui a nommé le nouveau syndic — et
// passe la copro INACTIVE au référentiel. Elle sort aussitôt de la facturation, des
// alertes et des listes ; le dossier prend le relais pour tout le reste.
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
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import { perdreCoproAction } from "@/app/gestion-courante/actions";

export interface PerteRecente {
  id: string;
  coproCode: string;
  coproNom: string;
  dateAgISO: string;
  faites: number;
  total: number;
}

export function PerdreCopro({
  copros,
  perdues,
  aujourdhuiISO,
}: {
  /** Copros ACTIVES du cabinet, par code. */
  copros: { code: string; nom: string }[];
  /** Les derniers dossiers de perte ouverts. */
  perdues: PerteRecente[];
  aujourdhuiISO: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [code, setCode] = useState("");
  const [ag, setAg] = useState(aujourdhuiISO);
  const [fin, setFin] = useState(aujourdhuiISO);
  const [motif, setMotif] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const copro = copros.find((c) => c.code === code);
  const JOUR = /^\d{4}-\d{2}-\d{2}$/;
  const pret = Boolean(copro) && JOUR.test(ag) && JOUR.test(fin) && confirmation.trim().toUpperCase() === code.toUpperCase();

  function perdre() {
    demarrer(async () => {
      const res = await perdreCoproAction({ coproCode: code, dateAgISO: ag, finGestionISO: fin, motif, confirmation });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`${code} ${copro?.nom ?? ""} est passée inactive : dossier de perte ouvert.`);
      router.push(`/perte-copro/${res.donnees!.dossierId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Copropriété" htmlFor="perte-copro" className="sm:col-span-3">
          <Select id="perte-copro" value={code} onChange={(e) => { setCode(e.target.value); setConfirmation(""); }}>
            <option value="">Choisir…</option>
            {copros.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.nom}</option>
            ))}
          </Select>
        </Field>
        <Field label="AG qui a nommé le nouveau syndic" htmlFor="perte-ag">
          <Input id="perte-ag" type="date" value={ag} onChange={(e) => { setAg(e.target.value); if (fin === aujourdhuiISO || fin < e.target.value) setFin(e.target.value); }} />
        </Field>
        <Field label="Dernier jour géré" htmlFor="perte-fin">
          <Input id="perte-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </Field>
        <Field label="Motif (facultatif)" htmlFor="perte-motif">
          <Textarea id="perte-motif" rows={1} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Changement de syndic, vente…" />
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
        La copropriété passe <span className="font-medium">inactive</span> au référentiel et un dossier de perte
        s&apos;ouvre avec la checklist du cabinet (comptables à informer, archives, clés, registre, espace client à
        J+15, clôture comptable). Le dernier trimestre géré n&apos;est pas facturé au prorata automatiquement :
        le faire partir avant, ou à la main.
      </p>
      {perdues.length > 0 && (
        <Rows>
          {perdues.map((p) => (
            <Row
              key={p.id}
              href={`/perte-copro/${p.id}`}
              avant={p.coproCode}
              principal={p.coproNom}
              secondaire={<>AG du {formatDateLongue(p.dateAgISO)}</>}
              droite={
                <Badge ton={p.faites === p.total ? "ok" : "neutral"}>
                  {p.faites}/{p.total} étapes
                </Badge>
              }
            />
          ))}
        </Rows>
      )}
    </div>
  );
}
