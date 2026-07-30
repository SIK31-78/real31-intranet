"use client";

// Liste des dossiers + creation. Filtres type / statut. Decision Sekou 2026-06-23.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Plus, FolderOpen, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TYPE_DOSSIER_LABEL,
  TYPE_DOSSIER_ORDRE,
  STATUT_DOSSIER_LABEL,
  PORTEE_LABEL,
  progressionDossier,
  type Dossier,
  type TypeDossier,
  type PorteeDossier,
  type StatutDossier,
} from "@/lib/domain/dossier";
import { creerDossierAction } from "@/app/dossiers/actions";

const TYPE_TON: Record<TypeDossier, "info" | "warn" | "err" | "neutral"> = {
  gestion_courante: "neutral",
  travaux: "info",
  sinistre: "warn",
  impaye: "err",
  recouvrement: "err",
  procedure: "neutral",
  question_diverse: "neutral",
  autre: "neutral",
};
const STATUT_TON: Record<StatutDossier, "warn" | "info" | "ok"> = {
  ouvert: "warn",
  en_cours: "info",
  clos: "ok",
};
const PORTEES: PorteeDossier[] = ["copropriete", "coproprietaire", "lot"];
const SELECT = "h-8 rounded-md border border-line bg-surface px-2 text-[13px] text-ink";

export function DossiersVue({
  dossiers,
  copros,
}: {
  dossiers: Dossier[];
  copros: { code: string; nom: string }[];
}) {
  const [filtreType, setFiltreType] = useState<"all" | TypeDossier>("all");
  const [filtreStatut, setFiltreStatut] = useState<"all" | StatutDossier>("all");
  const [filtreCopro, setFiltreCopro] = useState<"all" | string>("all");
  const [tri, setTri] = useState<"recent" | "copro">("recent");
  const [formOuvert, setFormOuvert] = useState(false);

  // Copros qui ont au moins un dossier (pour ne proposer que celles-la dans le filtre).
  const coprosAvecDossier = useMemo(() => {
    const codes = new Set(dossiers.map((d) => d.coproCode));
    return copros.filter((c) => codes.has(c.code));
  }, [dossiers, copros]);

  const visibles = useMemo(() => {
    const f = dossiers.filter(
      (d) =>
        (filtreType === "all" || d.type === filtreType) &&
        (filtreStatut === "all" || d.statut === filtreStatut) &&
        (filtreCopro === "all" || d.coproCode === filtreCopro),
    );
    return [...f].sort((a, b) =>
      tri === "copro"
        ? a.coproCode.localeCompare(b.coproCode) || b.ouvertLe.localeCompare(a.ouvertLe)
        : b.ouvertLe.localeCompare(a.ouvertLe),
    );
  }, [dossiers, filtreType, filtreStatut, filtreCopro, tri]);

  // Tri "par copropriete" -> on affiche les dossiers REGROUPES sous un en-tete de copro
  // (et non une simple liste a plat). `visibles` est deja trie par copro puis par date.
  const groupes = useMemo(() => {
    if (tri !== "copro") return null;
    const map = new Map<string, { code: string; nom: string; items: Dossier[] }>();
    for (const d of visibles) {
      const g = map.get(d.coproCode) ?? { code: d.coproCode, nom: d.coproNom ?? "", items: [] };
      g.items.push(d);
      map.set(d.coproCode, g);
    }
    return [...map.values()];
  }, [visibles, tri]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filtreType} onChange={(e) => setFiltreType(e.target.value as typeof filtreType)} className={SELECT}>
          <option value="all">Tous les types</option>
          {TYPE_DOSSIER_ORDRE.map((t) => (
            <option key={t} value={t}>{TYPE_DOSSIER_LABEL[t]}</option>
          ))}
        </select>
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as typeof filtreStatut)} className={SELECT}>
          <option value="all">Tous les statuts</option>
          {(["ouvert", "en_cours", "clos"] as StatutDossier[]).map((s) => (
            <option key={s} value={s}>{STATUT_DOSSIER_LABEL[s]}</option>
          ))}
        </select>
        {coprosAvecDossier.length > 0 && (
          <select value={filtreCopro} onChange={(e) => setFiltreCopro(e.target.value)} className={SELECT}>
            <option value="all">Toutes les copros</option>
            {coprosAvecDossier.map((c) => (
              <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
            ))}
          </select>
        )}
        <select value={tri} onChange={(e) => setTri(e.target.value as typeof tri)} className={SELECT} title="Trier">
          <option value="recent">Tri : récents</option>
          <option value="copro">Tri : par copropriété</option>
        </select>
        <span className="text-[12px] text-ink-3">{visibles.length} dossier{visibles.length > 1 ? "s" : ""}</span>
        <button
          type="button"
          onClick={() => setFormOuvert((o) => !o)}
          className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-white text-[13px] font-medium hover:bg-green-600 transition-colors"
        >
          <Plus strokeWidth={2} className="w-3.5 h-3.5" /> Nouveau dossier
        </button>
      </div>

      {formOuvert && <FormCreation copros={copros} onFait={() => setFormOuvert(false)} />}

      {visibles.length === 0 ? (
        <Card>
          <div className="px-4 py-10 text-center">
            <FolderOpen strokeWidth={1.5} className="w-6 h-6 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] text-ink-3">Aucun dossier. Crée le premier avec « Nouveau dossier ».</p>
          </div>
        </Card>
      ) : groupes ? (
        <div className="flex flex-col gap-4">
          {groupes.map((g) => (
            <Card key={g.code} className="overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-2 border-b border-line">
                <span className="font-mono text-[12px] text-ink-2">{g.code}</span>
                <span className="text-[12.5px] font-medium text-ink truncate">{g.nom}</span>
                <span className="ml-auto text-[11px] text-ink-3">{g.items.length} dossier{g.items.length > 1 ? "s" : ""}</span>
              </div>
              <ul className="divide-y divide-line">
                {g.items.map((d) => <LigneDossier key={d.id} d={d} masquerCopro />)}
              </ul>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {visibles.map((d) => <LigneDossier key={d.id} d={d} />)}
          </ul>
        </Card>
      )}
    </div>
  );
}

// Une ligne de dossier. `masquerCopro` quand on est deja sous un en-tete de copro
// (vue groupee) -> evite de repeter le code/nom de copro a chaque ligne.
function LigneDossier({ d, masquerCopro = false }: { d: Dossier; masquerCopro?: boolean }) {
  const p = progressionDossier(d);
  return (
    <li>
      <Link
        href={`/dossiers/${d.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset"
      >
        <Badge ton={TYPE_TON[d.type]} className="shrink-0 w-[100px] justify-center">{TYPE_DOSSIER_LABEL[d.type]}</Badge>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink truncate">{d.titre}</div>
          <div className="text-[12px] text-ink-3 truncate">
            {masquerCopro ? (
              d.cible ?? ""
            ) : (
              <>
                <span className="font-mono">{d.coproCode}</span> {d.coproNom ?? ""}
                {d.cible ? ` - ${d.cible}` : ""}
              </>
            )}
          </div>
        </div>
        <span className="text-[11px] text-ink-3 font-mono shrink-0 hidden sm:block">{p.faites}/{p.total}</span>
        <Badge ton={STATUT_TON[d.statut]} dot className="shrink-0">{STATUT_DOSSIER_LABEL[d.statut]}</Badge>
        <ChevronRight strokeWidth={1.5} className="w-4 h-4 text-ink-4 shrink-0" />
      </Link>
    </li>
  );
}

function FormCreation({
  copros,
  onFait,
}: {
  copros: { code: string; nom: string }[];
  onFait: () => void;
}) {
  const [coproCode, setCoproCode] = useState(copros[0]?.code ?? "");
  const [type, setType] = useState<TypeDossier>("travaux");
  const [portee, setPortee] = useState<PorteeDossier>("copropriete");
  const [cible, setCible] = useState("");
  const [titre, setTitre] = useState("");
  const [modele, setModele] = useState(true);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!coproCode || !titre.trim()) return;
    startTransition(async () => {
      await creerDossierAction({
        coproCode,
        type,
        portee,
        ...(portee !== "copropriete" && cible.trim() ? { cible: cible.trim() } : {}),
        titre: titre.trim(),
        modele,
      });
      onFait();
    });
  };

  return (
    <Card>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Copropriété
            <select value={coproCode} onChange={(e) => setCoproCode(e.target.value)} className={SELECT}>
              {copros.map((c) => (
                <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Type
            <select value={type} onChange={(e) => setType(e.target.value as TypeDossier)} className={SELECT}>
              {TYPE_DOSSIER_ORDRE.map((t) => (
                <option key={t} value={t}>{TYPE_DOSSIER_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Portée
            <select value={portee} onChange={(e) => setPortee(e.target.value as PorteeDossier)} className={SELECT}>
              {PORTEES.map((p) => (
                <option key={p} value={p}>{PORTEE_LABEL[p]}</option>
              ))}
            </select>
          </label>
          {portee !== "copropriete" && (
            <label className="flex flex-col gap-1 text-[12px] text-ink-3">
              {portee === "lot" ? "Lot (réf.)" : "Copropriétaire"}
              <input
                value={cible}
                onChange={(e) => setCible(e.target.value)}
                placeholder={portee === "lot" ? "ex. Lot 12" : "Nom du copropriétaire"}
                className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]"
              />
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1 text-[12px] text-ink-3">
          Intitulé du dossier
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="ex. Ravalement façade, Dégât des eaux 3e étage..."
            autoFocus
            className="h-8 rounded-md border border-line bg-surface px-2 text-[13px]"
          />
        </label>
        <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" checked={modele} onChange={(e) => setModele(e.target.checked)} className="accent-green-700" />
          Pré-remplir avec les étapes types (modifiables ensuite)
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={pending || !titre.trim()}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-white text-[13px] font-medium hover:bg-green-600 disabled:opacity-50 transition-colors"
          >
            Créer le dossier
          </button>
          <button
            type="button"
            onClick={onFait}
            className="h-8 px-3 rounded-md border border-line text-[13px] text-ink-2 hover:border-line-2"
          >
            Annuler
          </button>
        </div>
      </div>
    </Card>
  );
}
