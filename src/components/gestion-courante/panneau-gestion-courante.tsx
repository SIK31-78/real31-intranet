"use client";

// Panneau comptable : facturation trimestrielle de la gestion courante.
// Le comptable choisit un trimestre, obtient un recap (nombre de copros, total),
// puis lance la facturation de toutes les copros eligibles en un geste.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Search, CheckCircle2, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import type { ApercuGestionCourante } from "@/lib/services/facturation/gestion-courante";
import {
  apercuGestionCouranteAction,
  lancerGestionCouranteAction,
} from "@/app/gestion-courante/actions";

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

/** Les 8 derniers trimestres, du plus recent au plus ancien. */
function trimestresRecents(courant: string): string[] {
  const [a, t] = courant.split("-T").map(Number);
  const out: string[] = [];
  let annee = a ?? 2026;
  let tri = t ?? 1;
  for (let i = 0; i < 8; i++) {
    out.push(`${annee}-T${tri}`);
    tri -= 1;
    if (tri === 0) {
      tri = 4;
      annee -= 1;
    }
  }
  return out;
}

export function PanneauGestionCourante({ trimestreParDefaut }: { trimestreParDefaut: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [periode, setPeriode] = useState(trimestreParDefaut);
  const [apercu, setApercu] = useState<ApercuGestionCourante | null>(null);
  const [confirme, setConfirme] = useState(false);

  function calculer() {
    setApercu(null);
    setConfirme(false);
    demarrer(async () => {
      const res = await apercuGestionCouranteAction(periode);
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees) setApercu(res.donnees);
    });
  }

  function lancer() {
    demarrer(async () => {
      const res = await lancerGestionCouranteAction(periode);
      if (!res.ok) return toast.err(res.erreur);
      const r = res.donnees;
      if (r) {
        if (r.enErreur > 0) {
          toast.err(`${r.emises} facture(s) émise(s), ${r.enErreur} en erreur.`);
        } else {
          toast.ok(`${r.emises} facture(s) de gestion courante émise(s) pour ${r.periode}.`);
        }
      }
      setApercu(null);
      setConfirme(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-ink-2" htmlFor="periode">
              Trimestre à facturer
            </label>
            <select
              id="periode"
              className="rounded border border-line px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-green-700"
              value={periode}
              onChange={(e) => {
                setPeriode(e.target.value);
                setApercu(null);
                setConfirme(false);
              }}
            >
              {trimestresRecents(trimestreParDefaut).map((t) => (
                <option key={t} value={t}>
                  {t.replace("-T", " — Trimestre ")}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={calculer}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded border border-line px-3 py-2 text-[13px] font-medium text-ink hover:bg-black/[0.03] disabled:opacity-50"
          >
            {pending && !apercu ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" strokeWidth={1.5} />
            )}
            Calculer le récapitulatif
          </button>
        </div>

        {apercu && (
          <div className="rounded-lg border border-line">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-lg bg-line sm:grid-cols-4">
              {[
                { l: "Copropriétés à facturer", v: String(apercu.nbAFacturer) },
                { l: "Déjà facturées ce trimestre", v: String(apercu.nbDejaFacturees) },
                { l: "Honoraires HT", v: euros(apercu.totalHonorairesHt) },
                { l: "Timbres", v: euros(apercu.totalTimbres) },
              ].map((c) => (
                <div key={c.l} className="bg-surface px-3 py-2.5">
                  <div className="text-[11px] uppercase tracking-wide text-ink-3">{c.l}</div>
                  <div className="mt-0.5 text-[15px] font-semibold text-ink">{c.v}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="text-[13px] text-ink-3">
                Total du trimestre
                <span className="ml-2 text-[16px] font-semibold text-ink">
                  {apercu.totalHtLibelle} HT
                </span>
              </div>
            </div>

            {apercu.nbAFacturer === 0 ? (
              <p className="flex items-start gap-2 border-t border-line bg-black/[0.03] px-4 py-3 text-[13px] text-ink-3">
                <CheckCircle2 className="mt-px h-4 w-4 shrink-0" strokeWidth={1.5} />
                Toutes les copropriétés éligibles sont déjà facturées pour ce trimestre. Rien à
                lancer.
              </p>
            ) : (
              <div className="border-t border-line px-4 py-3">
                <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirme}
                    onChange={(e) => setConfirme(e.target.checked)}
                  />
                  <span>
                    Je confirme la facturation de <strong>{apercu.nbAFacturer}</strong> copropriété
                    {apercu.nbAFacturer > 1 ? "s" : ""} pour <strong>{apercu.periode}</strong>, soit{" "}
                    <strong>{apercu.totalHtLibelle} HT</strong>. Un brouillon Pennylane sera créé par
                    copropriété.
                  </span>
                </label>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={lancer}
                    disabled={pending || !confirme}
                    className="inline-flex items-center gap-2 rounded bg-green-700 px-3 py-2 text-[13px] font-medium text-white hover:bg-green-800 disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    Lancer la facturation du trimestre
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="flex items-start gap-2 text-[12px] text-ink-3">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          Le montant de chaque copropriété est calculé depuis son contrat en vigueur (honoraires
          annuels ÷ 4 pour le trimestre). Une copropriété déjà facturée pour le trimestre choisi est
          automatiquement exclue : relancer ne double-facture pas.
        </p>
      </div>
    </Card>
  );
}
