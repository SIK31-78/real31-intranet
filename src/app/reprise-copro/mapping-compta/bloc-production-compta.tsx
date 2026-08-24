"use client";

// BLOC DE PRODUCTION du volet compta (le parcours prouve S0303) - remplace l'ancien bouton
// "Importer dans eStale" desactive (moment flou supprime : l'import par API n'existe plus).
//
// Parcours en 3 temps, dans l'ordre du geste reel :
//   1. PRODUIRE : entries.xlsx + fiche d'eclatements + la batterie des 11 auto-checks
//      (POST /api/reprise/produire-compta, re-upload des memes fichiers GL que l'analyse) ;
//   2. IMPORTER A LA MAIN dans l'UI eStale (module Expert pour le fichier, module
//      Eclatement pour les classes 1/7) - le module ne fait AUCUNE ecriture ;
//   3. VERIFIER : confronter les cibles de calage aux soldes relus dans eStale (lecture seule).

import { useState, useTransition } from "react";
import { Check, Database, Download, Loader2, ShieldCheck, AlertTriangle, MinusCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { BatterieCompta, CheckCompta } from "@/lib/reprise/domain/auto-checks-compta";
import type { FicheEclatements } from "@/lib/reprise/domain/eclatements";
import type { ExclusionEntries } from "@/lib/reprise/domain/entries";
import { verifierImportComptaAction, type VerifierImportResultat } from "./actions";

interface Production {
  batterie?: BatterieCompta;
  fiche?: FicheEclatements;
  exclusions: ExclusionEntries[];
  warnings: string[];
  erreurs: string[];
  cibles: Record<string, number>;
  nbLignes: number;
  entriesXlsxBase64?: string;
  omission?: { applicable: boolean; nbPaires: number; notes: string[] };
  ok: boolean;
}

function euro(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BlocProductionCompta({
  coproCode,
  files,
  pret,
  aTraiter,
}: {
  coproCode: string;
  /** Les MEMES fichiers grand livre que l'analyse (la production re-extrait, stateless). */
  files: File[];
  /** Verdict pretAImporter du plan resolu (decisions appliquees). */
  pret: boolean;
  aTraiter: number;
}) {
  const [dateOuverture, setDateOuverture] = useState("");
  const [exercice, setExercice] = useState<"cloture" | "en_cours">("cloture");
  const [production, setProduction] = useState<Production | null>(null);
  const [verif, setVerif] = useState<VerifierImportResultat | null>(null);
  const [pendingProd, startProd] = useTransition();
  const [pendingVerif, startVerif] = useTransition();
  const toast = useToast();

  const produire = () => {
    if (!pret || files.length === 0) return;
    startProd(async () => {
      const fd = new FormData();
      fd.append("coproCode", coproCode);
      if (dateOuverture) fd.append("dateOuverture", dateOuverture);
      fd.append("exercice", exercice);
      for (const f of files) fd.append("pdfs", f);
      try {
        const res = await fetch("/api/reprise/produire-compta", { method: "POST", body: fd });
        const r = await res.json();
        if (!res.ok && r.message) {
          toast.err(r.message);
          return;
        }
        setProduction(r as Production);
        setVerif(null);
        if (r.ok) toast.ok("Fichiers produits - batterie des 11 auto-checks verte.");
        else toast.err("Production controlee : au moins un auto-check en echec (rien n'est livre).");
      } catch {
        toast.err("Erreur reseau pendant la production.");
      }
    });
  };

  const verifier = () => {
    if (!production || Object.keys(production.cibles).length === 0) return;
    startVerif(async () => {
      const r = await verifierImportComptaAction(coproCode, production.cibles);
      setVerif(r);
      if (!r.ok) toast.err(r.message);
      else if (r.conforme) toast.ok(`Soldes conformes : ${r.nbControles} compte(s), 0 ecart.`);
      else toast.err("Des ecarts subsistent apres import : voir le detail.");
    });
  };

  const telecharger = () => {
    if (!production?.entriesXlsxBase64) return;
    const octets = Uint8Array.from(atob(production.entriesXlsxBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([octets], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `entries_${coproCode}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-md border border-line bg-surface p-4 flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Database strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
        <span className="text-[14px] font-medium text-ink">Production des fichiers d&apos;import</span>
        <Badge ton="info">l&apos;import se fait A LA MAIN dans l&apos;UI eStale - aucune ecriture par API</Badge>
      </div>

      {/* 1. PRODUIRE */}
      <div className="flex items-end gap-3 flex-wrap">
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          1er jour de l&apos;exercice (pose les reports a-nouveaux)
          <input
            type="date"
            value={dateOuverture}
            onChange={(e) => setDateOuverture(e.target.value)}
            className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
          />
        </label>
        {files.length === 2 && (
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Exercice a produire
            <select
              value={exercice}
              onChange={(e) => setExercice(e.target.value as "cloture" | "en_cours")}
              className="h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink"
            >
              <option value="cloture">Exercice cloture (N-1)</option>
              <option value="en_cours">Exercice en cours (N)</option>
            </select>
          </label>
        )}
        <Button type="button" variant="primary" onClick={produire} disabled={!pret || pendingProd || files.length === 0}>
          {pendingProd ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <ShieldCheck strokeWidth={1.5} />}
          Produire entries.xlsx + fiche d&apos;eclatements
        </Button>
        {!pret && (
          <span className="text-[12px] text-ink-3">
            Il reste {aTraiter} compte(s) a trancher avant de pouvoir produire.
          </span>
        )}
      </div>

      {production && (
        <>
          {production.erreurs.length > 0 && (
            <ul className="text-[12px] text-err-700 space-y-0.5">
              {production.erreurs.map((e, i) => (
                <li key={i}>- {e}</li>
              ))}
            </ul>
          )}

          {production.batterie && <TableBatterie batterie={production.batterie} />}

          {production.ok && production.entriesXlsxBase64 && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button type="button" variant="primary" onClick={telecharger}>
                <Download strokeWidth={1.5} /> Telecharger entries.xlsx ({production.nbLignes} lignes)
              </Button>
              <span className="text-[12px] text-ink-3">
                Import dans eStale : Comptabilite -&gt; Grand livre -&gt; Import Excel (module Expert, classes 4/5/6).
              </span>
            </div>
          )}

          {production.fiche && production.fiche.comptes.length > 0 && <FicheEclatementsVue fiche={production.fiche} />}

          {production.exclusions.length > 0 && (
            <div className="text-[12px] text-ink-3">
              Comptes exclus du fichier (traces) :{" "}
              {production.exclusions.map((e) => `${e.compte} (${e.motif})`).join(" ; ")}
            </div>
          )}

          {production.warnings.length > 0 && (
            <ul className="text-[12px] text-warn-700 space-y-0.5">
              {production.warnings.map((w, i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          {/* 3. VERIFIER apres l'import humain */}
          {production.ok && Object.keys(production.cibles).length > 0 && (
            <div className="border-t border-line pt-3 flex flex-col gap-2">
              <div className="flex items-center gap-3 flex-wrap">
                <Button type="button" variant="secondary" onClick={verifier} disabled={pendingVerif}>
                  {pendingVerif ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Check strokeWidth={1.5} />}
                  Verifier les soldes apres import (lecture eStale)
                </Button>
                <span className="text-[12px] text-ink-3">
                  {Object.keys(production.cibles).length} cible(s) de calage - a lancer APRES l&apos;import dans l&apos;UI.
                </span>
              </div>
              {verif && <ResultatVerification verif={verif} />}
              <CiblesCalage cibles={production.cibles} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// --- Batterie des 11 checks --------------------------------------------------

function IconeCheck({ statut }: { statut: CheckCompta["statut"] }) {
  if (statut === "ok") return <Check strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" />;
  if (statut === "echec") return <AlertTriangle strokeWidth={1.5} className="w-3.5 h-3.5 text-err-700" />;
  return <MinusCircle strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4" />;
}

function TableBatterie({ batterie }: { batterie: BatterieCompta }) {
  return (
    <div className="rounded-md border border-line overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 flex items-center gap-2 text-[12.5px] font-medium text-ink">
        Batterie des 11 auto-checks comptables
        <Badge ton={batterie.ok ? "ok" : "err"}>
          {batterie.ok ? "verte" : `${batterie.nbEchecs} echec(s)`}
        </Badge>
        {batterie.nbNonExecutes > 0 && <Badge ton="neutral">{batterie.nbNonExecutes} non execute(s)</Badge>}
      </div>
      <ul className="divide-y divide-line">
        {batterie.checks.map((c) => (
          <li key={c.code} className="px-3 py-1.5 text-[12px]">
            <div className="flex items-center gap-2">
              <IconeCheck statut={c.statut} />
              <span className="font-mono text-ink-4">{c.numero}.</span>
              <span className={cn(c.statut === "echec" ? "text-err-700 font-medium" : "text-ink-2")}>{c.libelle}</span>
            </div>
            {c.details.length > 0 && (
              <ul className={cn("mt-0.5 ml-9 space-y-0.5", c.statut === "echec" ? "text-err-700" : "text-ink-4")}>
                {c.details.slice(0, 8).map((d, i) => (
                  <li key={i}>- {d}</li>
                ))}
                {c.details.length > 8 && <li>... et {c.details.length - 8} autre(s).</li>}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Fiche d'eclatements ------------------------------------------------------

function FicheEclatementsVue({ fiche }: { fiche: FicheEclatements }) {
  return (
    <div className="rounded-md border border-line overflow-hidden">
      <div className="px-3 py-2 bg-surface-2 text-[12.5px] font-medium text-ink">
        Fiche d&apos;eclatements (classes 1 et 7 - module Eclatement, JAMAIS entries.xlsx)
        <span className="ml-2 font-normal text-ink-3">
          complement de balance attendu : {euro(fiche.totalSigne)}
        </span>
      </div>
      <ul className="divide-y divide-line">
        {fiche.comptes.map((c) => (
          <li key={c.compteSource} className="px-3 py-2 text-[12px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-ink">{c.compteSource}</span>
              {c.intitule && <span className="text-ink-3">{c.intitule}</span>}
              <Badge ton={c.sens === "credit" ? "info" : "warn"}>
                {c.sens} {euro(c.montant)}
              </Badge>
            </div>
            {c.detail && (
              <ul className="mt-1 ml-4 text-ink-3 space-y-0.5">
                {c.detail.map((d, i) => (
                  <li key={i}>
                    {d.ligne} : {euro(d.montant)}
                    {d.cle ? ` (cle ${d.cle})` : ""}
                  </li>
                ))}
              </ul>
            )}
            {c.consignes.length > 0 && (
              <ul className="mt-1 ml-4 text-[11.5px] text-ink-4 space-y-0.5">
                {c.consignes.map((k, i) => (
                  <li key={i}>- {k}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Verification post-import -------------------------------------------------

function ResultatVerification({ verif }: { verif: VerifierImportResultat }) {
  if (!verif.ok) return <p className="text-[12px] text-err-700">{verif.message}</p>;
  if (verif.conforme) {
    return (
      <p className="text-[12.5px] text-green-700 flex items-center gap-1.5">
        <Check strokeWidth={1.5} className="w-4 h-4" />
        Calage conforme : {verif.nbControles} compte(s) cible, 0 ecart au centime.
      </p>
    );
  }
  return (
    <div className="rounded-md border border-err-500/40 bg-err-50 p-3 text-[12px] text-err-700">
      <p className="font-medium">Des ecarts subsistent apres import :</p>
      <ul className="mt-1 space-y-0.5">
        {verif.ecarts.map((e) => (
          <li key={e.compte}>
            {e.compte} : attendu {euro(e.attendu)}
            {e.lu === null ? " - compte INTROUVABLE dans eStale" : ` / lu ${euro(e.lu)} (ecart ${euro(e.ecart ?? 0)})`}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Table des cibles de calage (le rapport final doit lister les soldes attendus par compte). */
function CiblesCalage({ cibles }: { cibles: Record<string, number> }) {
  const [ouvert, setOuvert] = useState(false);
  const entrees = Object.entries(cibles).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="w-full px-3 py-2 text-left text-[12.5px] font-medium text-ink hover:bg-surface-2"
      >
        Cibles de calage ({entrees.length} comptes) - soldes attendus apres import
      </button>
      {ouvert && (
        <table className="w-full text-[12px]">
          <tbody className="divide-y divide-line">
            {entrees.map(([compte, solde]) => (
              <tr key={compte}>
                <td className="px-3 py-1 font-mono text-ink-2">{compte}</td>
                <td className="px-3 py-1 text-right font-mono text-ink">{euro(solde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
