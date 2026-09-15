"use client";

// Ouvrir un dossier de perte depuis le module : meme geste que « Perdre une copropriété »
// dans la gestion courante (code retapé pour confirmer), même action métier derrière.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ouvrirDossierAction } from "./actions";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export function OuvrirDossierPerte({
  copros,
  aujourdhuiISO,
}: {
  copros: { code: string; nom: string }[];
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
  const pret = Boolean(copro) && JOUR.test(ag) && JOUR.test(fin) && confirmation.trim().toUpperCase() === code.toUpperCase();

  function ouvrir() {
    demarrer(async () => {
      const res = await ouvrirDossierAction({ coproCode: code, dateAgISO: ag, finGestionISO: fin, motif, confirmation });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Dossier de perte ouvert pour ${code}.`);
      router.push(`/perte-copro/${res.donnees!.dossierId}`);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Copropriété" htmlFor="ouv-copro" className="sm:col-span-3">
          <Select id="ouv-copro" value={code} onChange={(e) => { setCode(e.target.value); setConfirmation(""); }}>
            <option value="">Choisir…</option>
            {copros.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.nom}</option>
            ))}
          </Select>
        </Field>
        <Field label="AG qui a nommé le nouveau syndic" htmlFor="ouv-ag">
          <Input id="ouv-ag" type="date" value={ag} onChange={(e) => { setAg(e.target.value); if (fin === aujourdhuiISO || fin < e.target.value) setFin(e.target.value); }} />
        </Field>
        <Field label="Dernier jour géré" htmlFor="ouv-fin">
          <Input id="ouv-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </Field>
        <Field label="Motif (facultatif)" htmlFor="ouv-motif">
          <Textarea id="ouv-motif" rows={1} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Changement de syndic, vente…" />
        </Field>
      </div>
      {copro && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={`Retaper « ${copro.code} » pour confirmer`} htmlFor="ouv-confirm">
            <Input id="ouv-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} largeur="auto" className="font-mono" autoComplete="off" />
          </Field>
          <Button type="button" variant="primary" disabled={!pret || pending} onClick={ouvrir}>
            {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <LogOut strokeWidth={1.5} />}
            Ouvrir le dossier de perte
          </Button>
        </div>
      )}
      <p className="text-body text-ink-2">
        La copropriété passe <span className="font-medium">inactive</span> au référentiel : elle sort de la facturation,
        des alertes et des listes. Les étapes se datent depuis l&apos;AG (dès le lendemain, J+15, clôture définitive à 5 ans).
      </p>
    </div>
  );
}
