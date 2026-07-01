"use client";

// Liste des dossiers de reprise + formulaire "nouveau dossier". Style aligne sur la
// liste dossiers de l'intranet (Card + lignes + Badge statut + progression). Etat en
// memoire cote serveur (repo memoire) : bandeau "non persistant" affiche par la page.

import { useState, useTransition } from "react";
import { Plus, FolderOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { StatutDossier } from "@/lib/reprise/domain/dossier";
import { creerDossierAction } from "./actions";

// Vue serialisable d'un dossier (ce que la page server passe au client). On ne
// transmet pas tout le Dossier : juste ce qu'affiche la liste.
export interface DossierResume {
  ref: string;
  nomUsuel: string;
  statut: StatutDossier;
  avancement: number; // 0..1
  etapesFaites: number;
  etapesTotal: number;
  nbAnomalies: number;
}

const STATUT_LABEL: Record<StatutDossier, string> = {
  offre: "Offre",
  production: "Production",
  verification: "Verification",
  comptabilite: "Comptabilite",
  finalisation: "Finalisation",
  termine: "Termine",
};

const STATUT_TON: Record<StatutDossier, "neutral" | "info" | "warn" | "ok"> = {
  offre: "neutral",
  production: "info",
  verification: "warn",
  comptabilite: "warn",
  finalisation: "info",
  termine: "ok",
};

const INPUT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink";

export function DossiersRepriseVue({ dossiers }: { dossiers: DossierResume[] }) {
  const [formOuvert, setFormOuvert] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-ink-3">
          {dossiers.length} dossier{dossiers.length > 1 ? "s" : ""}
        </span>
        <Button
          type="button"
          variant="primary"
          onClick={() => setFormOuvert((o) => !o)}
          className="ml-auto"
        >
          <Plus strokeWidth={2} /> Nouveau dossier
        </Button>
      </div>

      {formOuvert && <FormCreation onFait={() => setFormOuvert(false)} />}

      {dossiers.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <FolderOpen strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">
              Aucun dossier de reprise. Cree le premier avec &laquo;&nbsp;Nouveau dossier&nbsp;&raquo;.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {dossiers.map((d) => (
              <LigneDossier key={d.ref} d={d} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function LigneDossier({ d }: { d: DossierResume }) {
  const pct = Math.round(d.avancement * 100);
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-ink-2 shrink-0">{d.ref}</span>
          <span className="text-[13px] font-medium text-ink truncate">{d.nomUsuel}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 w-[120px] max-w-[40vw] rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[11px] text-ink-3 font-mono">
            {d.etapesFaites}/{d.etapesTotal}
          </span>
          {d.nbAnomalies > 0 && (
            <span className="text-[11px] text-err-700">
              {d.nbAnomalies} anomalie{d.nbAnomalies > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
      <Badge ton={STATUT_TON[d.statut]} dot className="shrink-0">
        {STATUT_LABEL[d.statut]}
      </Badge>
    </li>
  );
}

function FormCreation({ onFait }: { onFait: () => void }) {
  const [ref, setRef] = useState("");
  const [nomUsuel, setNomUsuel] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const submit = () => {
    if (!ref.trim() || !nomUsuel.trim()) return;
    startTransition(async () => {
      const r = await creerDossierAction({ ref: ref.trim(), nomUsuel: nomUsuel.trim() });
      if (r.ok) {
        toast.ok("Dossier de reprise cree.");
        setRef("");
        setNomUsuel("");
        onFait();
      } else {
        toast.err(r.message);
      }
    });
  };

  return (
    <Card>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Reference eStale
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="ex. S0302"
              autoFocus
              className={INPUT}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Nom de la copropriete
            <input
              value={nomUsuel}
              onChange={(e) => setNomUsuel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="ex. 31 Foch"
              className={INPUT}
            />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" onClick={submit} disabled={pending || !ref.trim() || !nomUsuel.trim()}>
            Creer le dossier
          </Button>
          <Button type="button" variant="secondary" onClick={onFait}>
            Annuler
          </Button>
        </div>
      </div>
    </Card>
  );
}
