"use client";

// Historique des facturations : ce qui est parti, ce qui a echoue, et de quoi
// rejouer un echec. Remplace l'ancienne file d'attente, devenue sans objet
// depuis que l'emission est enchainee a la confirmation.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, CheckCircle2, TriangleAlert, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { rejouerFactureAction } from "@/app/facturation/actions";

export interface FactureAffichee {
  id: string;
  coproCode: string;
  typePrestation: string;
  libelle: string;
  dateFacture: string;
  statut: "a_facturer" | "facturee" | "erreur";
  montantHt: number;
  factureExterneId?: string;
  erreur?: string;
  par?: string;
}

const LIBELLE_TYPE: Record<string, string> = {
  depassement_cs: "Dépassement CS",
  depassement_ag: "Dépassement AG",
  suivi_travaux: "Suivi de travaux",
  suivi_sinistre: "Suivi de sinistre",
  pre_etat_date: "Pré-état daté",
  etat_date: "État daté",
};

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}
function jour(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}

function Statut({ statut }: { statut: FactureAffichee["statut"] }) {
  if (statut === "facturee") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-green-800">
        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Envoyée
      </span>
    );
  }
  if (statut === "erreur") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-red-700">
        <TriangleAlert className="w-3.5 h-3.5" strokeWidth={1.5} /> Échec
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-ink-3">
      <Clock className="w-3.5 h-3.5" strokeWidth={1.5} /> En attente
    </span>
  );
}

export function HistoriqueFacturations({ factures }: { factures: FactureAffichee[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [enCours, setEnCours] = useState<string | null>(null);

  function rejouer(id: string) {
    setEnCours(id);
    demarrer(async () => {
      const res = await rejouerFactureAction(id);
      setEnCours(null);
      if (!res.ok) return toast.err(res.erreur);
      const r = res.donnees;
      if (r && r.enErreur > 0) toast.err(r.erreurs[0]?.message ?? "Échec de l'envoi.");
      else toast.ok("Facture renvoyée.");
      router.refresh();
    });
  }

  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Historique des facturations{" "}
          <span className="font-normal text-ink-3">({factures.length})</span>
        </h2>
      </div>

      {factures.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-3">
          Aucune facturation pour l&apos;instant.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {factures.map((f) => (
            <li key={f.id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-ink">
                    <span className="font-medium">{f.coproCode}</span>
                    <span className="text-ink-3"> · </span>
                    {LIBELLE_TYPE[f.typePrestation] ?? f.typePrestation}
                  </p>
                  <p className="truncate text-[12px] text-ink-3">
                    {jour(f.dateFacture)}
                    {f.par ? ` · ${f.par}` : ""}
                    {f.factureExterneId ? ` · Pennylane ${f.factureExterneId}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[13px] font-medium text-ink">{euros(f.montantHt)} HT</span>
                  <Statut statut={f.statut} />
                  {f.statut === "erreur" && (
                    <button
                      type="button"
                      onClick={() => rejouer(f.id)}
                      disabled={pending}
                      title="Renvoyer vers Pennylane"
                      className="inline-flex items-center gap-1 rounded border border-line px-2 py-1 text-[12px] text-ink hover:bg-black/[0.03] disabled:opacity-50"
                    >
                      {pending && enCours === f.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} />
                      )}
                      Réessayer
                    </button>
                  )}
                </div>
              </div>
              {f.statut === "erreur" && f.erreur && (
                <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[11px] leading-snug text-red-800">
                  {f.erreur.slice(0, 300)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
