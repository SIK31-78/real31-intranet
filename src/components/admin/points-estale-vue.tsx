"use client";

// Vue client de /admin/estale : chips de filtres avec compteurs, lignes EPUREES
// (titre + badges, cliquables), tous les controles dans le panneau deplie. Les points
// clos (resolus / abandonnes) sont replies en bas pour ne pas noyer l'actif.

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, MessageSquareText, Plus } from "lucide-react";
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

const selectCls =
  "rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600";

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
    <li
      className={cn(
        "rounded-md border bg-surface",
        p.bloquant && !clos ? "border-err-500/40" : "border-line",
        clos && "opacity-60",
      )}
    >
      {/* Ligne compacte : tout se lit d'un regard, aucun controle - ils vivent dans le deplie. */}
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left hover:bg-surface-2/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
      >
        {ouvert ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-4" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-4" />
        )}
        {p.bloquant && (
          <span
            title="Bloquant"
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-err-50 text-err-700"
          >
            <AlertTriangle strokeWidth={1.5} className="h-3 w-3" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{p.titre}</span>
        {p.reponse && (
          <span title="Réponse d'ESTALE reçue" className="shrink-0 text-ok-700">
            <MessageSquareText strokeWidth={1.5} className="h-3.5 w-3.5" />
          </span>
        )}
        {p.demandeur && (
          <span className="hidden shrink-0 text-[11.5px] text-ink-3 sm:inline" title="Demandeur">
            {p.demandeur}
          </span>
        )}
        <Badge ton="neutral" className="hidden shrink-0 md:inline-flex">
          {LIBELLES_CATEGORIE_POINT[p.categorie]}
        </Badge>
        <Badge ton={TONS_STATUT_POINT[p.statut]} className="shrink-0">
          {LIBELLES_STATUT_POINT[p.statut]}
        </Badge>
        <span className="hidden shrink-0 text-[11.5px] tabular-nums text-ink-4 lg:inline">{jjmmaaaa(p.createdAt)}</span>
      </button>

      {ouvert && (
        <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">
          {/* Rangee de pilotage : statut, categorie, demandeur, bloquant. */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Statut
              <select
                value={p.statut}
                onChange={(e) =>
                  editer(
                    { statut: e.target.value as StatutPointEstale },
                    `Statut : ${LIBELLES_STATUT_POINT[e.target.value as StatutPointEstale]}`,
                  )
                }
                className={selectCls}
              >
                {STATUTS_POINT_ESTALE.map((s) => (
                  <option key={s} value={s}>
                    {LIBELLES_STATUT_POINT[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Catégorie
              <select
                value={p.categorie}
                onChange={(e) => editer({ categorie: e.target.value as CategoriePointEstale }, "Catégorie mise à jour")}
                className={selectCls}
              >
                {CATEGORIES_POINT_ESTALE.map((c) => (
                  <option key={c} value={c}>
                    {LIBELLES_CATEGORIE_POINT[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-ink-2">
              Demandeur
              <input
                defaultValue={p.demandeur ?? ""}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (p.demandeur ?? "")) editer({ demandeur: v || null }, "Demandeur mis à jour");
                }}
                maxLength={20}
                placeholder="CHB, FS…"
                className="w-28 rounded-md border border-line bg-surface px-2 py-1.5 text-[13px] text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              />
            </label>
            <label
              className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2"
              title="Point bloquant pour le cabinet"
            >
              <input
                type="checkbox"
                checked={p.bloquant}
                onChange={(e) =>
                  editer({ bloquant: e.target.checked }, e.target.checked ? "Marqué bloquant" : "Bloquant retiré")
                }
                className="accent-err-700"
              />
              Bloquant
            </label>
            {p.resoluAt && <span className="mb-2 ml-auto text-[11.5px] text-ink-4">clos le {jjmmaaaa(p.resoluAt)}</span>}
          </div>

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            Titre
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
              className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
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
              rows={detail ? Math.min(10, Math.max(3, detail.split("\n").length + 1)) : 3}
              maxLength={8000}
              placeholder="Contexte, exemples, cas concrets…"
              className="w-full resize-y rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
            />
          </label>

          <label className="flex flex-col gap-1 text-[12px] text-ink-2">
            <span className={cn(p.reponse && "font-medium text-ok-700")}>Réponse d&apos;ESTALE</span>
            <textarea
              value={reponse}
              onChange={(e) => setReponse(e.target.value)}
              onBlur={() => {
                if (reponse !== (p.reponse ?? "")) editer({ reponse: reponse.trim() || null }, "Réponse enregistrée");
              }}
              rows={reponse ? Math.min(8, Math.max(2, reponse.split("\n").length + 1)) : 2}
              maxLength={8000}
              placeholder="Rien reçu pour l'instant : colle la réponse du mail ici."
              className={cn(
                "w-full resize-y rounded-md border px-2.5 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600",
                p.reponse ? "border-ok-500/40 bg-ok-50/40" : "border-line bg-surface",
              )}
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
  const [ajoutOuvert, setAjoutOuvert] = useState(false);

  const [filtreCategorie, setFiltreCategorie] = useState<CategoriePointEstale | "toutes">("toutes");
  const [filtreDemandeur, setFiltreDemandeur] = useState<string>("tous");
  const [tri, setTri] = useState<"priorite" | "recents" | "anciens">("priorite");
  const [closOuverts, setClosOuverts] = useState(false);

  const demandeurs = useMemo(
    () => [...new Set(points.map((p) => p.demandeur).filter((d): d is string => Boolean(d)))].sort(),
    [points],
  );
  const filtres = useMemo(() => {
    let l = points;
    if (filtreCategorie !== "toutes") l = l.filter((p) => p.categorie === filtreCategorie);
    if (filtreDemandeur !== "tous") l = l.filter((p) => p.demandeur === filtreDemandeur);
    if (tri === "recents") l = [...l].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (tri === "anciens") l = [...l].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return l; // "priorite" = l'ordre du serveur (bloquants d'abord, puis avancement)
  }, [points, filtreCategorie, filtreDemandeur, tri]);

  const actifs = filtres.filter((p) => p.statut !== "resolu" && p.statut !== "abandonne");
  const clos = filtres.filter((p) => p.statut === "resolu" || p.statut === "abandonne");
  const nbBloquants = actifs.filter((p) => p.bloquant).length;
  const compteCategorie = (c: CategoriePointEstale | "toutes") =>
    (c === "toutes" ? points : points.filter((p) => p.categorie === c)).filter(
      (p) => p.statut !== "resolu" && p.statut !== "abandonne",
    ).length;

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
        setAjoutOuvert(false);
      } else {
        err(r.message ?? "Ajout impossible.");
      }
    });
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {/* Barre : filtres a gauche, tri + ajout a droite. */}
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
              <span className="ml-1 text-ink-4">{compteCategorie(c)}</span>
            </button>
          ))}
        </div>
        {demandeurs.length > 0 && (
          <select
            value={filtreDemandeur}
            onChange={(e) => setFiltreDemandeur(e.target.value)}
            title="Filtrer par demandeur"
            className={selectCls}
          >
            <option value="tous">Tous les demandeurs</option>
            {demandeurs.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={tri}
            onChange={(e) => setTri(e.target.value as typeof tri)}
            title="Trier l'affichage"
            className={selectCls}
          >
            <option value="priorite">Bloquants d&apos;abord</option>
            <option value="recents">Plus récents</option>
            <option value="anciens">Plus anciens</option>
          </select>
          <Button variant="primary" onClick={() => setAjoutOuvert((v) => !v)}>
            <Plus strokeWidth={1.5} className="h-3.5 w-3.5" />
            Nouveau point
          </Button>
        </div>
      </div>

      {/* Ajout : replie par defaut, la liste reste la vedette. */}
      {ajoutOuvert && (
        <div className="rounded-md border border-green-600/30 bg-green-50/30 px-4 py-3">
          <div className="flex flex-col gap-2">
            <input
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ajouter();
                if (e.key === "Escape") setAjoutOuvert(false);
              }}
              maxLength={200}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- on vient d'ouvrir le formulaire
              autoFocus
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
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as CategoriePointEstale)}
                className={selectCls}
              >
                {CATEGORIES_POINT_ESTALE.map((c) => (
                  <option key={c} value={c}>
                    {LIBELLES_CATEGORIE_POINT[c]}
                  </option>
                ))}
              </select>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  checked={bloquant}
                  onChange={(e) => setBloquant(e.target.checked)}
                  className="accent-err-700"
                />
                Bloquant
              </label>
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={() => setAjoutOuvert(false)} disabled={enCours}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={ajouter} disabled={enCours || !titre.trim()}>
                  Ajouter
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-[12px] text-ink-3">
        {actifs.length} point{actifs.length > 1 ? "s" : ""} actif{actifs.length > 1 ? "s" : ""}
        {nbBloquants > 0 && (
          <span className="font-medium text-err-700">
            , dont {nbBloquants} bloquant{nbBloquants > 1 ? "s" : ""}
          </span>
        )}
        {clos.length > 0 && <span> · {clos.length} clos</span>}
      </p>

      <ul className="flex flex-col gap-1.5">
        {actifs.map((p) => (
          <LignePoint key={p.id} p={p} />
        ))}
        {actifs.length === 0 && (
          <li className="rounded-md border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
            Aucun point actif ne correspond à ces filtres.
          </li>
        )}
      </ul>

      {/* Les clos, replies : l'historique ne noie pas l'actif. */}
      {clos.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setClosOuverts((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3 hover:text-ink"
          >
            {closOuverts ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Points clos ({clos.length})
          </button>
          {closOuverts && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {clos.map((p) => (
                <LignePoint key={p.id} p={p} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
