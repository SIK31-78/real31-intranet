"use client";

// Panneau comptable : facturation trimestrielle de la gestion courante.
//
// Ce n'est plus un bouton « tout facturer ». Depuis que les factures peuvent
// partir VALIDEES chez Pennylane (irreversibles), l'ecran donne un dernier
// regard LIGNE PAR LIGNE : chaque copropriete porte un verdict calcule contre
// son contrat, et la comptable choisit ce qui part.
//
//   - « Tout sélectionner » ne coche QUE les lignes sans alerte ;
//   - un geste separe ajoute les alertes (sous-facturation, +10 %) ;
//   - au-dela de +20 %, il faut taper le mot « facturer » pour cette ligne ;
//   - une copro deja facturee sur le trimestre, ou sans contrat, est grisee.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, Search, CheckCircle2, TriangleAlert, PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  messageEmissionFacture,
  type ModeEmissionFacture,
} from "@/lib/domain/facturation/mode-emission";
import type { VerdictLigne } from "@/lib/domain/facturation/filet-gestion-courante";
import type {
  ApercuGestionCourante,
  LigneApercuGc,
} from "@/lib/services/facturation/gestion-courante";
import {
  apercuGestionCouranteAction,
  lancerGestionCouranteAction,
} from "@/app/gestion-courante/actions";
import { DialogueConfirmationEcrite } from "./dialogue-confirmation-ecrite";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ")} €`;
}

function pourcent(pct: number | null): string {
  if (pct === null) return "-";
  const signe = pct > 0 ? "+" : "";
  return `${signe}${(pct * 100).toFixed(1).replace(".", ",")} %`;
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

const TON_VERDICT: Record<VerdictLigne, "ok" | "warn" | "err" | "neutral" | "info"> = {
  ok: "ok",
  prorata: "info",
  sous_facturation: "warn",
  alerte_10: "warn",
  alerte_20: "err",
  deja_facturee: "neutral",
  contrat_absent: "err",
};

function libelleVerdict(l: LigneApercuGc): string {
  switch (l.verdict) {
    case "ok":
      return "Conforme";
    case "prorata":
      return `Prorata (${l.prorataJours} j)`;
    case "sous_facturation":
      return "Sous-facturation";
    case "alerte_10":
      return `Surfacturation ${pourcent(l.ecartPct)}`;
    case "alerte_20":
      return `Surfacturation ${pourcent(l.ecartPct)}`;
    case "deja_facturee":
      return "Déjà facturée";
    case "contrat_absent":
      return "Contrat non renseigné";
  }
}

export function PanneauGestionCourante({
  trimestreParDefaut,
  pennylaneMode,
}: {
  trimestreParDefaut: string;
  pennylaneMode: ModeEmissionFacture;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [periode, setPeriode] = useState(trimestreParDefaut);
  const [apercu, setApercu] = useState<ApercuGestionCourante | null>(null);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [confirmees, setConfirmees] = useState<ReadonlySet<string>>(new Set());
  const [aConfirmer, setAConfirmer] = useState<LigneApercuGc | null>(null);

  function reinitialiser() {
    setApercu(null);
    setSelection(new Set());
    setConfirmees(new Set());
    setAConfirmer(null);
  }

  function calculer() {
    reinitialiser();
    demarrer(async () => {
      const res = await apercuGestionCouranteAction(periode);
      if (!res.ok) return toast.err(res.erreur);
      if (res.donnees) {
        setApercu(res.donnees);
        // Pre-selection = les lignes sans aucune alerte. Le reste se coche a la main.
        setSelection(
          new Set(res.donnees.lignes.filter((l) => l.selectionnableEnMasse).map((l) => l.coproCode)),
        );
      }
    });
  }

  // Reference stable : sans ce useMemo, `?? []` recree un tableau a chaque rendu
  // et invalide les memos qui en dependent.
  const lignes = useMemo(() => apercu?.lignes ?? [], [apercu]);
  const retenues = useMemo(
    () => lignes.filter((l) => selection.has(l.coproCode)),
    [lignes, selection],
  );
  const recap = useMemo(
    () => ({
      nb: retenues.length,
      total: retenues.reduce((s, l) => s + l.montantHt, 0),
      attendu: retenues.reduce((s, l) => s + l.attenduHt, 0),
    }),
    [retenues],
  );
  const nbSansAlerte = lignes.filter((l) => l.selectionnableEnMasse).length;
  const nbAlertes = lignes.filter(
    (l) => l.emissible && !l.selectionnableEnMasse && l.selectionnableAvecAlertes,
  ).length;

  function basculer(l: LigneApercuGc) {
    if (!l.emissible) return;
    const suivante = new Set(selection);
    if (suivante.has(l.coproCode)) {
      suivante.delete(l.coproCode);
      // On retire aussi la confirmation ecrite : re-cocher la ligne redemandera
      // le mot. La preuve doit rester attachee au geste qui engage.
      if (l.exigeConfirmationEcrite) {
        const c = new Set(confirmees);
        c.delete(l.coproCode);
        setConfirmees(c);
      }
      setSelection(suivante);
      return;
    }
    if (l.exigeConfirmationEcrite && !confirmees.has(l.coproCode)) {
      setAConfirmer(l);
      return;
    }
    suivante.add(l.coproCode);
    setSelection(suivante);
  }

  function selectionnerSansAlerte() {
    setSelection(new Set(lignes.filter((l) => l.selectionnableEnMasse).map((l) => l.coproCode)));
  }

  function ajouterLesAlertes() {
    const suivante = new Set(selection);
    for (const l of lignes) {
      if (l.emissible && l.selectionnableAvecAlertes) suivante.add(l.coproCode);
    }
    setSelection(suivante);
  }

  function confirmerParEcrit(l: LigneApercuGc) {
    setConfirmees(new Set(confirmees).add(l.coproCode));
    setSelection(new Set(selection).add(l.coproCode));
    setAConfirmer(null);
  }

  function lancer() {
    demarrer(async () => {
      const res = await lancerGestionCouranteAction(periode, {
        coproCodes: [...selection],
        confirmeesParEcrit: [...confirmees],
      });
      if (!res.ok) return toast.err(res.erreur);
      const r = res.donnees;
      if (r) {
        const mis = r.ignorees.length > 0 ? `, ${r.ignorees.length} mise(s) de côté` : "";
        if (r.enErreur > 0) {
          toast.err(`${r.emises} facture(s) émise(s), ${r.enErreur} en erreur${mis}.`);
        } else {
          toast.ok(`${r.emises} facture(s) de gestion courante émise(s) pour ${r.periode}${mis}.`);
        }
      }
      reinitialiser();
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-body font-medium text-ink-2" htmlFor="periode">
              Trimestre à facturer
            </label>
            <Select
              id="periode"
              largeur="auto"
              value={periode}
              onChange={(e) => {
                setPeriode(e.target.value);
                reinitialiser();
              }}
            >
              {trimestresRecents(trimestreParDefaut).map((t) => (
                <option key={t} value={t}>
                  {t.replace("-T", " · Trimestre ")}
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={calculer}
            disabled={pending}
            variant="secondary" size="lg"
          >
            {pending && !apercu ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" strokeWidth={1.5} />
            )}
            Calculer le récapitulatif
          </Button>
        </div>

        {apercu && (
          <div className="rounded-lg border border-line">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-t-lg bg-line sm:grid-cols-4">
              {[
                { l: "Copropriétés à facturer", v: String(apercu.nbAFacturer) },
                { l: "Déjà facturées ce trimestre", v: String(apercu.nbDejaFacturees) },
                { l: "Alertes à valider", v: String(apercu.nbAlertes + apercu.nbConfirmationEcrite) },
                { l: "Contrat non renseigné", v: String(apercu.nbContratAbsent) },
              ].map((c) => (
                <div key={c.l} className="bg-surface px-3 py-2.5">
                  <div className="text-meta uppercase tracking-wide text-ink-3">{c.l}</div>
                  <div className="mt-0.5 text-title font-semibold text-ink">{c.v}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
              <Button
                onClick={selectionnerSansAlerte}
                variant="secondary"
              >
                Tout sélectionner ({nbSansAlerte} sans alerte)
              </Button>
              {nbAlertes > 0 && (
                <Button
                  onClick={ajouterLesAlertes}
                  variant="ghost"
                >
                  Sélectionner aussi les {nbAlertes} alerte{nbAlertes > 1 ? "s" : ""}
                </Button>
              )}
              <Button
                onClick={() => setSelection(new Set())}
                variant="ghost"
              >
                Tout décocher
              </Button>
              {apercu.nbConfirmationEcrite > 0 && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-body text-err-700">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.5} />
                  {apercu.nbConfirmationEcrite} ligne{apercu.nbConfirmationEcrite > 1 ? "s" : ""} au-delà
                  de +20 % : confirmation écrite requise
                </span>
              )}
            </div>

            <div className="max-h-[420px] overflow-auto border-t border-line">
              <table className="w-full min-w-[720px] border-collapse text-body">
                <thead className="sticky top-0 z-10 bg-surface-2 text-meta uppercase tracking-wide text-ink-3">
                  <tr>
                    <th scope="col" className="w-9 px-3 py-2" />
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Copropriété
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      À facturer HT
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Attendu au contrat
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Écart
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Verdict
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => {
                    const cochee = selection.has(l.coproCode);
                    return (
                      <tr
                        key={l.coproCode}
                        className={`border-t border-line ${
 l.emissible ? "" : "bg-black/[0.02] text-ink-3"
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={cochee}
                            disabled={!l.emissible}
                            onChange={() => basculer(l)}
                            aria-label={`Facturer ${l.coproCode}`}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-ink">{l.coproCode}</div>
                          <div className="text-body text-ink-3">{l.message}</div>
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums">
                          {euros(l.montantHt)}
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-ink-3">
                          {euros(l.attenduHt)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right align-top tabular-nums ${
 Math.abs(l.ecartHt) < 0.01
                              ? "text-ink-3"
                              : l.ecartHt > 0
                                ? "text-err-700"
                                : "text-warn-700"
                          }`}
                        >
                          {pourcent(l.ecartPct)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge ton={TON_VERDICT[l.verdict]} dot>
                              {libelleVerdict(l)}
                            </Badge>
                            {l.exigeConfirmationEcrite &&
                              (confirmees.has(l.coproCode) ? (
                                <Badge ton="ok">Confirmée par écrit</Badge>
                              ) : (
                                <Button
                                  onClick={() => setAConfirmer(l)}
                                  variant="danger"
                                >
                                  <PenLine className="h-3 w-3" strokeWidth={1.5} />
                                  Confirmer
                                </Button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {recap.nb === 0 ? (
              <p className="flex items-start gap-2 border-t border-line bg-black/[0.03] px-4 py-3 text-body text-ink-3">
                <CheckCircle2 className="mt-px h-4 w-4 shrink-0" strokeWidth={1.5} />
                Aucune copropriété sélectionnée : rien ne partira.
              </p>
            ) : (
              <div className="border-t border-line px-4 py-3">
                {/* Recap de fournee : le dernier regard global avant d'engager. */}
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-body text-ink-2">
                  <span>
                    <strong className="text-title text-ink">{recap.nb}</strong> copropriété
                    {recap.nb > 1 ? "s" : ""}
                  </span>
                  <span>
                    total <strong className="text-title text-ink">{euros(recap.total)} HT</strong>
                  </span>
                  <span className="text-ink-3">attendu au contrat {euros(recap.attendu)}</span>
                  <span
                    className={
                      Math.abs(recap.total - recap.attendu) < 0.01 ? "text-ink-3" : "text-warn-700"
                    }
                  >
                    écart {euros(recap.total - recap.attendu)}
                  </span>
                </div>
                {/* null en mode brouillon (nominal) : rien a annoncer. */}
                {messageEmissionFacture(pennylaneMode) && (
                  <p className="mt-2 text-body text-ink-3">
                    {messageEmissionFacture(pennylaneMode)}
                  </p>
                )}
                <div className="mt-3">
                  <Button
                    onClick={lancer}
                    disabled={pending}
                    variant="primary" size="lg"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    Émettre les {recap.nb} facture{recap.nb > 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="flex items-start gap-2 text-body text-ink-3">
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
          Le montant de chaque copropriété vient de son contrat en vigueur (honoraires annuels ÷ 4),
          au prorata des jours couverts si la copropriété a été prise en gestion en cours de
          trimestre. La référence de contrôle est toujours le contrat, jamais le trimestre
          précédent. Une copropriété déjà facturée pour le trimestre choisi ne peut pas repartir.
        </p>
      </div>

      {aConfirmer && (
        <DialogueConfirmationEcrite
          coproCode={aConfirmer.coproCode}
          montant={euros(aConfirmer.montantHt)}
          attendu={euros(aConfirmer.attenduHt)}
          ecart={pourcent(aConfirmer.ecartPct)}
          onConfirmer={() => confirmerParEcrit(aConfirmer)}
          onAnnuler={() => setAConfirmer(null)}
        />
      )}
    </Card>
  );
}
