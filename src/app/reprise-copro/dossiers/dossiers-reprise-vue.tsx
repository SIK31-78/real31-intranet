"use client";

// Liste des dossiers de reprise + formulaire "nouveau dossier". Style aligne sur la
// liste dossiers de l'intranet (Card + lignes + Badge statut + progression). Etat en
// memoire cote serveur (repo memoire) : bandeau "non persistant" affiche par la page.
//
// ROLE : la liste est ouverte a TOUS (c'est LE suivi). "Nouveau dossier" = geste d'encadrement
// -> bouton GRISE (jamais cache) pour un non-admin, avec la raison au survol. La garde reelle
// est cote serveur (creerDossierAction).

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, FolderOpen, ChevronRight, Archive, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import type { StatutDossier } from "@/lib/reprise/domain/dossier";
import { creerDossierAction } from "./actions";

// Vue serialisable d'un dossier (ce que la page server passe au client). On ne
// transmet pas tout le Dossier : juste ce qu'affiche la liste.
export interface DossierResume {
  ref: string;
  nomUsuel: string;
  statut: StatutDossier;
  archive: boolean;
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

export function DossiersRepriseVue({
  dossiers,
  adminReprise,
}: {
  dossiers: DossierResume[];
  /** Directeur / manager / super-admin : seul lui peut ouvrir une nouvelle reprise. */
  adminReprise: boolean;
}) {
  const [formOuvert, setFormOuvert] = useState(false);
  // Les dossiers ARCHIVES sont masques par defaut ; un filtre "Archives (N)" les affiche.
  const [voirArchives, setVoirArchives] = useState(false);

  const actifs = dossiers.filter((d) => !d.archive);
  const archives = dossiers.filter((d) => d.archive);
  const affiches = voirArchives ? archives : actifs;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-ink-3">
          {actifs.length} dossier{actifs.length > 1 ? "s" : ""}
        </span>
        {archives.length > 0 && (
          <button
            type="button"
            onClick={() => setVoirArchives((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12px] transition-colors",
              voirArchives
                ? "border-green-600/40 bg-green-50 text-green-800"
                : "border-line text-ink-3 hover:border-line-2",
            )}
          >
            <Archive strokeWidth={1.5} className="w-3.5 h-3.5" />
            {voirArchives ? "Voir les actifs" : `Archives (${archives.length})`}
          </button>
        )}
        <Button
          type="button"
          variant="primary"
          onClick={() => setFormOuvert((o) => !o)}
          className="ml-auto"
          disabled={!adminReprise}
          title={
            adminReprise
              ? undefined
              : "Reserve aux directeurs et managers : ouvrir une reprise engage le cabinet sur un onboarding."
          }
        >
          {adminReprise ? <Plus strokeWidth={2} /> : <Lock strokeWidth={1.5} />} Nouveau dossier
        </Button>
      </div>

      {!adminReprise && (
        <p className="text-[12px] text-ink-3 border border-line rounded-md bg-surface-2 px-3 py-2">
          <span className="font-medium text-ink-2">Ouvrir une reprise est reserve aux directeurs et managers.</span>{" "}
          Tu peux consulter le suivi de chaque dossier ci-dessous (avancement, checklist, journal).
        </p>
      )}

      {formOuvert && adminReprise && <FormCreation onFait={() => setFormOuvert(false)} />}

      {affiches.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <FolderOpen strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">
              {voirArchives
                ? "Aucun dossier archive."
                : "Aucun dossier de reprise. Cree le premier avec « Nouveau dossier »."}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {affiches.map((d) => (
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
    <li>
      <Link
        href={`/reprise-copro/dossiers/${encodeURIComponent(d.ref)}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:bg-surface-2"
      >
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
        {d.archive && (
          <Badge ton="neutral" className="shrink-0 gap-1">
            <Archive strokeWidth={1.5} className="w-3 h-3" /> Archive
          </Badge>
        )}
        <Badge ton={STATUT_TON[d.statut]} dot className="shrink-0">
          {STATUT_LABEL[d.statut]}
        </Badge>
        <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
      </Link>
    </li>
  );
}

function FormCreation({ onFait }: { onFait: () => void }) {
  const [ref, setRef] = useState("");
  const [nomUsuel, setNomUsuel] = useState("");
  const [adresse, setAdresse] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const submit = () => {
    if (!ref.trim() || !nomUsuel.trim()) return;
    startTransition(async () => {
      const r = await creerDossierAction({
        ref: ref.trim(),
        nomUsuel: nomUsuel.trim(),
        adresse: adresse.trim() || undefined,
      });
      if (r.ok) {
        toast.ok("Dossier de reprise cree.");
        setRef("");
        setNomUsuel("");
        setAdresse("");
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
          <label className="flex flex-col gap-1 text-[12px] text-ink-3 sm:col-span-2">
            Adresse de l&apos;immeuble <span className="text-ink-4">(optionnel)</span>
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="ex. 31 avenue Foch, 31000 Toulouse"
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
