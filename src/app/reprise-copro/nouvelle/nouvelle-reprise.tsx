"use client";

// Parcours "Nouvelle reprise" (client) : upload multi-PDF -> Analyser -> recap GO/STOP
// -> GO (produire les .xlsx eStale). La production est desactivee tant que le recap n'est
// pas pretAProduire (erreurs bloquantes). Telechargements via liens data-URI (base64).
//
// Etat volontairement local (pas de persistance) : c'est un poste de travail, pas une
// entite metier. On garde le `jeu` renvoye par l'analyse pour le repasser a la production.

import { useState, useTransition } from "react";
import { FileUp, Download, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { RecapPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import { analyserAction, produireAction, type FichierProduit } from "./actions";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

interface Analyse {
  recap: RecapPatrimoine;
  jeu: JeuDeDonnees;
}

export function NouvelleReprise() {
  const [files, setFiles] = useState<File[]>([]);
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [fichiers, setFichiers] = useState<FichierProduit[] | null>(null);
  const [analysePending, startAnalyse] = useTransition();
  const [produisPending, startProduis] = useTransition();
  const toast = useToast();

  const lancerAnalyse = () => {
    if (files.length === 0) return;
    startAnalyse(async () => {
      setAnalyse(null);
      setFichiers(null);
      const fd = new FormData();
      for (const f of files) fd.append("pdfs", f);
      const r = await analyserAction(fd);
      if (r.ok) {
        setAnalyse({ recap: r.recap, jeu: r.jeu });
        toast.ok("Analyse terminee.");
      } else {
        toast.err(r.message);
      }
    });
  };

  const lancerProduction = () => {
    if (!analyse) return;
    startProduis(async () => {
      const r = await produireAction(analyse.jeu);
      if (r.ok) {
        setFichiers(r.fichiers);
        toast.ok("Fichiers eStale produits.");
      } else {
        toast.err(r.message);
      }
    });
  };

  const recap = analyse?.recap;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Upload */}
      <Card className="p-4">
        <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <FileUp strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          1. Documents sources (PDF)
        </div>
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="mt-3 block w-full text-[13px] text-ink-2 file:mr-3 file:rounded-md file:border-0 file:bg-green-700 file:px-3 file:py-2 file:text-white file:text-[13px] file:font-medium hover:file:bg-green-600 file:cursor-pointer"
        />
        {files.length > 0 && (
          <ul className="mt-2 text-[12px] text-ink-3 space-y-0.5">
            {files.map((f) => (
              <li key={f.name}>- {f.name}</li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <Button type="button" variant="primary" onClick={lancerAnalyse} disabled={files.length === 0 || analysePending}>
            {analysePending ? "Analyse en cours..." : "Analyser"}
          </Button>
        </div>
      </Card>

      {/* 2. Recap GO/STOP */}
      {recap && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-medium text-ink">2. Recapitulatif (a valider)</div>
            <Badge ton="warn" className="gap-1.5">
              <Sparkles strokeWidth={1.5} className="w-3 h-3" />
              mode demonstration
            </Badge>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Lots" valeur={recap.lots.total} />
            <Stat label="Coproprietaires" valeur={recap.owners.total} />
            <Stat label="Attributions" valeur={recap.attributions.total} />
            <Stat label="Lots orphelins" valeur={recap.attributions.lotsOrphelins} alerte={recap.attributions.lotsOrphelins > 0} />
          </div>

          <StatsUsage parUsage={recap.lots.parUsage} />

          <h3 className="mt-5 text-[12px] font-medium text-ink-2 uppercase tracking-wide">Cles de repartition</h3>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px] uppercase text-ink-4">
                <tr>
                  <th className="py-1 font-medium">Code</th>
                  <th className="font-medium">Libelle</th>
                  <th className="text-right font-medium">Lots</th>
                  <th className="text-right font-medium">Somme</th>
                  <th className="text-right font-medium">Ecart</th>
                </tr>
              </thead>
              <tbody>
                {recap.cles.map((c) => (
                  <tr key={c.code} className="border-t border-line">
                    <td className="py-1.5 font-mono text-ink-2">{c.code}</td>
                    <td className="text-ink">{c.libelle}</td>
                    <td className="text-right text-ink-2">{c.nbLots}</td>
                    <td className="text-right text-ink-2">{c.sommeCalculee}</td>
                    <td className={`text-right font-medium ${c.ecart === 0 ? "text-ok-700" : "text-err-700"}`}>{c.ecart}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[12.5px] text-ink-3">
            Owners : {recap.owners.sci} SCI - {recap.owners.couples} couple(s) - {recap.fusionsProposees} fusion(s)
            proposee(s) - {recap.doublonsNonTranchables} doublon(s) non tranchable(s)
          </p>

          {recap.notes.length > 0 && <Bloc titre="Points de vigilance (extraction)" items={recap.notes} ton="info" />}
          {recap.checks.erreurs.length > 0 && (
            <Bloc titre="Erreurs bloquantes" items={recap.checks.erreurs.map((e) => e.message)} ton="err" />
          )}
          {recap.checks.warnings.length > 0 && (
            <Bloc titre="Avertissements" items={recap.checks.warnings.map((w) => w.message)} ton="warn" />
          )}

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              variant="primary"
              onClick={lancerProduction}
              disabled={!recap.pretAProduire || produisPending}
            >
              {produisPending ? "Generation..." : "GO - produire les fichiers eStale"}
            </Button>
            {!recap.pretAProduire && (
              <span className="text-[12.5px] text-err-700">Corriger les erreurs bloquantes avant de produire.</span>
            )}
          </div>
        </Card>
      )}

      {/* 3. Telechargements */}
      {fichiers && (
        <Card className="p-4">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <Download strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
            3. Fichiers generes
          </div>
          <p className="mt-1 text-[12.5px] text-ink-3">
            Import eStale dans l&apos;ordre strict : lots -&gt; cles -&gt; tantiemes -&gt; owners -&gt; links.
          </p>
          <ul className="mt-3 space-y-1.5">
            {fichiers.map((f) => (
              <li key={f.nom}>
                <a
                  href={`data:${MIME_XLSX};base64,${f.base64}`}
                  download={f.nom}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-green-700 hover:text-green-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
                >
                  <Download strokeWidth={1.5} className="w-3.5 h-3.5" />
                  {f.nom}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, valeur, alerte }: { label: string; valeur: number; alerte?: boolean }) {
  return (
    <div className="rounded-md border border-line bg-surface-2 px-3 py-2">
      <div className={`text-[18px] font-semibold ${alerte ? "text-err-700" : "text-ink"}`}>{valeur}</div>
      <div className="text-[11px] text-ink-3">{label}</div>
    </div>
  );
}

function StatsUsage({ parUsage }: { parUsage: Record<string, number> }) {
  const nonNuls = Object.entries(parUsage).filter(([, n]) => n > 0);
  if (nonNuls.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {nonNuls.map(([usage, n]) => (
        <Badge key={usage} ton="neutral">
          {usage} : {n}
        </Badge>
      ))}
    </div>
  );
}

function Bloc({ titre, items, ton }: { titre: string; items: string[]; ton: "info" | "warn" | "err" }) {
  const couleurs = {
    info: "border-info-500/30 bg-info-50 text-info-700",
    warn: "border-warn-500/30 bg-warn-50 text-warn-700",
    err: "border-err-500/30 bg-err-50 text-err-700",
  }[ton];
  return (
    <div className={`mt-4 rounded-md border px-3 py-2.5 text-[12.5px] ${couleurs}`}>
      <p className="font-medium">{titre}</p>
      <ul className="mt-1 list-disc pl-5 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
