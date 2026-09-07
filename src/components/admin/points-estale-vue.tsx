"use client";

// Vue client de /admin/estale : ajout rapide en tete, liste triee (bloquants puis
// avancement), edition inline (titre / detail / reponse), changement de statut par
// menu. Outil personnel d'admin : tout est corrigeable, rien n'est verrouille.

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  CATEGORIES_POINT_ESTALE,
  LIBELLES_CATEGORIE_POINT,
  LIBELLES_STATUT_POINT,
  STATUTS_POINT_ESTALE,
  TONS_STATUT_POINT,
  type CategoriePointEstale,
  type PointEstale,
  type StatutPointEstale,
} from "@/lib/domain/points-estale";
import { creerPointAction, editerPointAction } from "@/app/admin/estale/actions";

function jjmmaaaa(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function LignePoint({ p }: { p: PointEstale }) {
  const { ok, err } = useToast();
  const [, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState(p.titre);
  const [detail, setDetail] = useState(p.detail ?? "");
  const [reponse, setReponse] = useState(p.reponse ?? "");
  const clos = p.statut === "resolu" || p.statut === "abandonne";

  function editer(patch: Record<string, unknown>, libelle: string) {
    startTransition(async () => {
      const r = await editerPointAction({ id: p.id, ...patch });
      if (r.ok) ok(libelle);
      else err(r.message ?? "Modification impossible.");
    });
  }

  return (
    <li className={cn("rounded-md border border-line bg-surface", clos && "opacity-60")}>
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          aria-label={ouvert ? "Replier" : "Déplier"}
          className="mt-1 text-ink-4 hover:text-ink"
        >
          {ouvert ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        {p.bloquant && (
          <span title="Bloquant" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-err-50 text-err-700">
            <AlertTriangle strokeWidth={1.5} className="h-3 w-3" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            onBlur={() => {
              const t = titre.trim();
              if (t && t !== p.titre) editer({ titre: t }, "Titre mis à jour");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            maxLength={200}
            className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-medium text-ink hover:border-line focus:border-line focus:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          />
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11.5px] text-ink-3">
            <Badge ton="neutral">{LIBELLES_CATEGORIE_POINT[p.categorie]}</Badge>
            {p.demandeur && <span title="Demandeur">{p.demandeur}</span>}
            <span>{jjmmaaaa(p.createdAt)}</span>
            {p.resoluAt && <span>clos le {jjmmaaaa(p.resoluAt)}</span>}
            {p.reponse && !ouvert && <Badge ton="ok">réponse reçue</Badge>}
          </div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11.5px] text-ink-3" title="Point bloquant pour le cabinet">
          <input type="checkbox" checked={p.bloquant} onChange={(e) => editer({ bloquant: e.target.checked }, "Mis à jour")} className="accent-err-700" />
          Bloquant
        </label>
        <select
          value={p.categorie}
          onChange={(e) => editer({ categorie: e.target.value as CategoriePointEstale }, "Catégorie mise à jour")}
          title="Catégorie"
          className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          {CATEGORIES_POINT_ESTALE.map((c) => (
            <option key={c} value={c}>
              {LIBELLES_CATEGORIE_POINT[c]}
            </option>
          ))}
        </select>
        <select
          value={p.statut}
          onChange={(e) => editer({ statut: e.target.value as StatutPointEstale }, `Statut : ${LIBELLES_STATUT_POINT[e.target.value as StatutPointEstale]}`)}
          className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          {STATUTS_POINT_ESTALE.map((s) => (
            <option key={s} value={s}>
              {LIBELLES_STATUT_POINT[s]}
            </option>
          ))}
        </select>
        <Badge ton={TONS_STATUT_POINT[p.statut]} className="mt-0.5 hidden sm:inline-flex shrink-0">
          {LIBELLES_STATUT_POINT[p.statut]}
        </Badge>
      </div>
      {ouvert && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3">
          <label className="flex w-40 flex-col gap-1 text-[12px] text-ink-2">
            Demandeur (initiales)
            <input
              defaultValue={p.demandeur ?? ""}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (p.demandeur ?? "")) editer({ demandeur: v || null }, "Demandeur mis à jour");
              }}
              maxLength={20}
              placeholder="CHB, FS…"
              className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Détail (interne)
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onBlur={() => {
                if (detail !== (p.detail ?? "")) editer({ detail: detail.trim() || null }, "Détail enregistré");
              }}
              rows={4}
              maxLength={8000}
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Réponse d&apos;ESTALE (collée depuis le mail)
            <textarea
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              onBlur={() => {
                if (reponse !== (p.reponse ?? "")) editer({ reponse: reponse.trim() || null }, "Réponse enregistrée");
              }}
              rows={3}
              maxLength={8000}
              placeholder="Rien reçu pour l'instant…"
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>
        </div>
      )}
    </li>
  );
}

export function PointsEstaleVue({ points }: { points: PointEstale[] }) {
  const { ok, err } = useToast();
  const [enCours, startTransition] = useTransition();
  const [titre, setTitre] = useState("");
  const [detail, setDetail] = useState("");
  const [bloquant, setBloquant] = useState(false);
  const [categorie, setCategorie] = useState<CategoriePointEstale>("produit");

  function ajouter() {
    const t = titre.trim();
    if (!t) return;
    startTransition(async () => {
      const r = await creerPointAction({ titre: t, detail: detail.trim() || undefined, bloquant, categorie });
      if (r.ok) {
        ok("Point ajouté");
        setTitre("");
        setDetail("");
        setBloquant(false);
      } else {
        err(r.message ?? "Ajout impossible.");
      }
    });
  }

  const [filtreCategorie, setFiltreCategorie] = useState<CategoriePointEstale | "toutes">("toutes");
  const [filtreDemandeur, setFiltreDemandeur] = useState<string>("tous");
  const [tri, setTri] = useState<"priorite" | "recents" | "anciens">("priorite");

  const demandeurs = useMemo(
    () => [...new Set(points.map((p) => p.demandeur).filter((d): d is string => Boolean(d)))].sort(),
    [points],
  );
  const visibles = useMemo(() => {
    let l = points;
    if (filtreCategorie !== "toutes") l = l.filter((p) => p.categorie === filtreCategorie);
    if (filtreDemandeur !== "tous") l = l.filter((p) => p.demandeur === filtreDemandeur);
    if (tri === "recents") l = [...l].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (tri === "anciens") l = [...l].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return l; // "priorite" = l'ordre du serveur (bloquants puis avancement)
  }, [points, filtreCategorie, filtreDemandeur, tri]);

  const actifs = points.filter((p) => p.statut !== "resolu" && p.statut !== "abandonne");
  const bloquants = actifs.filter((p) => p.bloquant).length;

  return (
    <div className="mt-5 flex flex-col gap-4">
      {/* Ajout rapide */}
      <div className="rounded-md border border-line bg-surface px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ajouter();
              }}
              maxLength={200}
              placeholder="Nouveau point à porter à ESTALE…"
              className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              maxLength={8000}
              placeholder="Détail (facultatif)…"
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            <select
              value={categorie}
              onChange={(e) => setCategorie(e.target.value as CategoriePointEstale)}
              className="rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            >
              {CATEGORIES_POINT_ESTALE.map((c) => (
                <option key={c} value={c}>
                  {LIBELLES_CATEGORIE_POINT[c]}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
              <input type="checkbox" checked={bloquant} onChange={(e) => setBloquant(e.target.checked)} className="accent-err-700" />
              Bloquant
            </label>
            <Button variant="primary" onClick={ajouter} disabled={enCours || !titre.trim()}>
              <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(["toutes", ...CATEGORIES_POINT_ESTALE] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFiltreCategorie(c)}
              aria-pressed={filtreCategorie === c}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                filtreCategorie === c
                  ? "border-green-600/40 bg-green-50 font-medium text-green-700"
                  : "border-line bg-surface text-ink-2 hover:bg-surface-2",
              )}
            >
              {c === "toutes" ? "Toutes" : LIBELLES_CATEGORIE_POINT[c]}
            </button>
          ))}
        </div>
        {demandeurs.length > 0 && (
          <select
            value={filtreDemandeur}
            onChange={(e) => setFiltreDemandeur(e.target.value)}
            title="Filtrer par demandeur"
            className="rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <option value="tous">Tous les demandeurs</option>
            {demandeurs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <select
          value={tri}
          onChange={(e) => setTri(e.target.value as typeof tri)}
          title="Trier l'affichage"
          className="ml-auto rounded-md border border-line bg-surface px-1.5 py-1 text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        >
          <option value="priorite">Tri : bloquants d&apos;abord</option>
          <option value="recents">Tri : plus récents</option>
          <option value="anciens">Tri : plus anciens</option>
        </select>
      </div>

      <p className="text-[12px] text-ink-3">
        {visibles.length} affiché{visibles.length > 1 ? "s" : ""} sur {actifs.length} actif{actifs.length > 1 ? "s" : ""}
        {bloquants > 0 && (
          <span className="text-err-700">, dont {bloquants} bloquant{bloquants > 1 ? "s" : ""}</span>
        )}
      </p>

      <ul className="flex flex-col gap-2">
        {visibles.map((p) => (
          <LignePoint key={p.id} p={p} />
        ))}
        {visibles.length === 0 && (
          <li className="rounded-md border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
            Aucun point ne correspond à ces filtres.
          </li>
        )}
      </ul>
    </div>
  );
}
