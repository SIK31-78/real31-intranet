"use client";

// L'onglet « Suivis » de /contrats-copro (REA-333, point 12 du plan) : UNE liste des cycles
// en cours, tous sujets confondus, qui se filtre en mémoire (quelques centaines de lignes au
// plus, comme /copropriete). Les compteurs suivent la recherche et le filtre de sujet, pas
// celui de niveau : ils disent ce qu'il y a de rouge, d'orange, de vert dans ce qu'on regarde.
// Les filtres se recopient dans l'URL (sans rechargement) : l'accueil pointe sur
// « ?niveau=rouge », un collègue peut coller le lien.
//
// Les cycles d'amorçage jamais démarrés (« à démarrer ») sont repliés par défaut : ils sont
// traités dans l'onglet « À compléter », et les montrer ici noierait les vrais dossiers.

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Choix, Input } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { Stat } from "@/components/ui/stat";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";
import { formatJourFR } from "@/lib/domain/contrats-copro/dates";
import { LIBELLE_NIVEAU, LIBELLE_SUJET, SUJETS, type NiveauQualifie, type SujetSuivi } from "@/lib/domain/contrats-copro/types";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";
import type { LigneSuivi } from "@/lib/services/contrats-copro/types";

type FiltreSujet = "tous" | SujetSuivi;
type FiltreNiveau = "tous" | NiveauQualifie;
type CleTri = "echeance" | "niveau" | "copro" | "sujet";
type Sens = "asc" | "desc";

const TON_NIVEAU: Record<NiveauQualifie, BadgeTon> = { rouge: "err", orange: "warn", vert: "ok", a_completer: "neutral" };
/** Rouge d'abord, puis orange, puis ce qui attend une échéance, puis les verts. */
const RANG_NIVEAU: Record<NiveauQualifie, number> = { rouge: 0, orange: 1, a_completer: 2, vert: 3 };
/** Au-delà, on demande d'affiner : un tableau de 1 000 lignes ne se lit pas. */
const MAX_AFFICHEES = 300;

export interface FiltreInitialSuivis {
  sujet?: SujetSuivi;
  niveau?: NiveauQualifie;
  q?: string;
}

/** Tout ce qu'une recherche libre peut attraper sur une ligne, normalisé une fois. */
function corpus(l: LigneSuivi): string {
  return normaliserTexte(
    [
      l.coproCode,
      l.coproNom,
      l.gestionnaire,
      l.agenceCode,
      LIBELLE_SUJET[l.sujet],
      l.etapeCourante,
      l.ascenseurIdentifiant,
      l.aDemarrer ? "à démarrer" : LIBELLE_NIVEAU[l.niveau],
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function comparer(a: LigneSuivi, b: LigneSuivi, cle: CleTri): number {
  switch (cle) {
    case "echeance":
      if (a.echeanceISO === b.echeanceISO) return 0;
      if (a.echeanceISO === null) return 1;
      if (b.echeanceISO === null) return -1;
      return a.echeanceISO.localeCompare(b.echeanceISO);
    case "niveau":
      return RANG_NIVEAU[a.niveau] - RANG_NIVEAU[b.niveau] || (b.joursSansAvancement ?? -1) - (a.joursSansAvancement ?? -1);
    case "copro":
      return a.coproNom.localeCompare(b.coproNom, "fr") || a.coproCode.localeCompare(b.coproCode);
    case "sujet":
      return SUJETS.indexOf(a.sujet) - SUJETS.indexOf(b.sujet);
  }
}

export function ListeSuivis({ lignes, initial }: { lignes: LigneSuivi[]; initial: FiltreInitialSuivis }) {
  const [q, setQ] = useState(initial.q ?? "");
  const [sujet, setSujet] = useState<FiltreSujet>(initial.sujet ?? "tous");
  const [niveau, setNiveau] = useState<FiltreNiveau>(initial.niveau ?? "tous");
  const [masquerADemarrer, setMasquerADemarrer] = useState(true);
  const [tri, setTri] = useState<{ cle: CleTri; sens: Sens }>({ cle: "echeance", sens: "asc" });

  // L'URL suit les filtres (sans passer par le serveur : le tableau est déjà là).
  useEffect(() => {
    const url = new URL(window.location.href);
    const poser = (cle: string, valeur: string | null) => (valeur ? url.searchParams.set(cle, valeur) : url.searchParams.delete(cle));
    poser("q", q.trim() || null);
    poser("sujet", sujet === "tous" ? null : sujet);
    poser("niveau", niveau === "tous" ? null : niveau);
    window.history.replaceState(window.history.state, "", url);
  }, [q, sujet, niveau]);

  const indexees = useMemo(() => lignes.map((l) => ({ l, texte: corpus(l) })), [lignes]);

  // Le périmètre des compteurs : recherche + sujet + repli des « à démarrer », PAS le niveau.
  const perimetre = useMemo(() => {
    const termes = normaliserTexte(q).split(" ").filter(Boolean);
    return indexees
      .filter(({ l, texte }) => {
        if (masquerADemarrer && l.aDemarrer) return false;
        if (sujet !== "tous" && l.sujet !== sujet) return false;
        return termes.every((t) => texte.includes(t));
      })
      .map(({ l }) => l);
  }, [indexees, q, sujet, masquerADemarrer]);

  const compteurs = useMemo(() => {
    const c = { total: perimetre.length, rouge: 0, orange: 0, vert: 0, aCompleter: 0 };
    for (const l of perimetre) {
      if (l.niveau === "rouge") c.rouge += 1;
      else if (l.niveau === "orange") c.orange += 1;
      else if (l.niveau === "vert") c.vert += 1;
      else c.aCompleter += 1;
    }
    return c;
  }, [perimetre]);

  const aDemarrerMasques = useMemo(() => (masquerADemarrer ? lignes.filter((l) => l.aDemarrer).length : 0), [lignes, masquerADemarrer]);

  const affichees = useMemo(() => {
    const filtrees = niveau === "tous" ? perimetre : perimetre.filter((l) => l.niveau === niveau);
    const signe = tri.sens === "asc" ? 1 : -1;
    return [...filtrees].sort((a, b) => signe * comparer(a, b, tri.cle) || comparer(a, b, "echeance") || comparer(a, b, "copro"));
  }, [perimetre, niveau, tri]);

  const filtreActif = q.trim() !== "" || sujet !== "tous" || niveau !== "tous";

  function trierPar(cle: CleTri) {
    setTri((t) => (t.cle === cle ? { cle, sens: t.sens === "asc" ? "desc" : "asc" } : { cle, sens: "asc" }));
  }

  if (lignes.length === 0) {
    return <EmptyState>Aucun suivi dans ce périmètre</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Suivis" valeur={String(compteurs.total)} note={filtreActif ? "dans ce filtre" : aDemarrerMasques > 0 ? `${aDemarrerMasques} à démarrer masqué${aDemarrerMasques > 1 ? "s" : ""}` : undefined} />
        <Stat label="Rouges" valeur={String(compteurs.rouge)} ton="err" note={compteurs.rouge > 0 ? "à relancer" : undefined} />
        <Stat label="Oranges" valeur={String(compteurs.orange)} ton="warn" note={compteurs.orange > 0 ? "à surveiller" : undefined} />
        <Stat label="À compléter" valeur={String(compteurs.aCompleter)} note={compteurs.aCompleter > 0 ? "sans échéance" : undefined} />
        <Stat label="Verts" valeur={String(compteurs.vert)} ton="ok" />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-56">
            <Search strokeWidth={1.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" aria-hidden />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher : code, nom, gestionnaire, agence, sujet, étape, appareil…"
              aria-label="Rechercher un suivi"
              autoComplete="off"
              className="pl-8"
            />
          </div>
          <Choix
            type="checkbox"
            checked={masquerADemarrer}
            onChange={(e) => setMasquerADemarrer(e.target.checked)}
            label="Masquer les suivis à démarrer"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <SegmentedControl<FiltreSujet>
            label="Sujet"
            size="sm"
            value={sujet}
            onChange={(v) => setSujet(v ?? "tous")}
            options={[{ value: "tous", label: "Tous les sujets" }, ...SUJETS.map((s) => ({ value: s, label: LIBELLE_SUJET[s] }))]}
          />
          <SegmentedControl<FiltreNiveau>
            label="Niveau"
            size="sm"
            value={niveau}
            onChange={(v) => setNiveau(v ?? "tous")}
            options={[
              { value: "tous", label: "Tous les niveaux" },
              { value: "rouge", label: "Rouge", ton: "err" },
              { value: "orange", label: "Orange", ton: "warn" },
              { value: "vert", label: "Vert", ton: "ok" },
              { value: "a_completer", label: "À compléter" },
            ]}
          />
          <span className="text-meta text-ink-3">
            {affichees.length} suivi{affichees.length > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {affichees.length === 0 ? (
        <EmptyState>Aucun suivi ne correspond à ces filtres</EmptyState>
      ) : (
        <>
          <TableSuivis lignes={affichees.slice(0, MAX_AFFICHEES)} tri={tri} onTrier={trierPar} />
          {affichees.length > MAX_AFFICHEES && (
            <p className="text-meta text-ink-3">Les {MAX_AFFICHEES} premiers sont affichés : affinez les filtres pour voir le reste.</p>
          )}
        </>
      )}
    </div>
  );
}

function ThTriable({ cle, tri, onTrier, children, numeric = false }: { cle: CleTri; tri: { cle: CleTri; sens: Sens }; onTrier: (c: CleTri) => void; children: string; numeric?: boolean }) {
  const actif = tri.cle === cle;
  const Icone = !actif ? ArrowUpDown : tri.sens === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th numeric={numeric} aria-sort={actif ? (tri.sens === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onTrier(cle)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[0.06em] text-meta font-medium hover:text-ink transition-colors duration-120",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm",
          actif ? "text-ink" : "text-ink-2",
        )}
      >
        {children}
        <Icone strokeWidth={1.5} className={cn("w-3 h-3", actif ? "text-ink" : "text-ink-3")} aria-hidden />
      </button>
    </Th>
  );
}

function TableSuivis({ lignes, tri, onTrier }: { lignes: LigneSuivi[]; tri: { cle: CleTri; sens: Sens }; onTrier: (c: CleTri) => void }) {
  return (
    <Table>
      <Thead>
        <tr>
          <ThTriable cle="copro" tri={tri} onTrier={onTrier}>Copropriété</ThTriable>
          <ThTriable cle="sujet" tri={tri} onTrier={onTrier}>Sujet</ThTriable>
          <ThTriable cle="echeance" tri={tri} onTrier={onTrier}>Échéance</ThTriable>
          <ThTriable cle="niveau" tri={tri} onTrier={onTrier}>Niveau</ThTriable>
          <Th>Étape courante</Th>
          <Th>Gestionnaire</Th>
          <Th>Agence</Th>
        </tr>
      </Thead>
      <Tbody>
        {lignes.map((l) => (
          <Tr key={l.cycleId} interactive ton={l.niveau === "rouge" ? "err" : l.niveau === "orange" ? "warn" : undefined}>
            <Td principal>
              <span className="font-mono text-ink-2 font-normal mr-2">{l.coproCode}</span>
              <LienLigne href={`/copropriete/${encodeURIComponent(l.coproCode)}?onglet=contrats`}>{l.coproNom}</LienLigne>
            </Td>
            <Td secondaire>
              {LIBELLE_SUJET[l.sujet]}
              {l.ascenseurIdentifiant && <span className="block text-meta text-ink-3">appareil {l.ascenseurIdentifiant}</span>}
            </Td>
            <Td secondaire className="tabular-nums">
              {l.echeanceISO ? formatJourFR(l.echeanceISO) : <span className="text-ink-3">à compléter</span>}
            </Td>
            <Td>
              <span className="inline-flex items-center gap-2 flex-wrap">
                <Badge ton={l.aDemarrer ? "outline" : TON_NIVEAU[l.niveau]} dot={!l.aDemarrer}>
                  {l.aDemarrer ? "À démarrer" : LIBELLE_NIVEAU[l.niveau]}
                </Badge>
                {!l.aDemarrer && l.joursSansAvancement !== null && (l.niveau === "orange" || l.niveau === "rouge") && (
                  <span className={cn("text-meta tabular-nums", l.niveau === "rouge" ? "text-err-700" : "text-warn-700")}>
                    figé depuis {l.joursSansAvancement} j
                  </span>
                )}
              </span>
            </Td>
            <Td secondaire>
              {l.aDemarrer ? (
                <span className="text-ink-3">suivi non démarré</span>
              ) : (
                <>
                  <span className="tabular-nums">
                    {l.franchies}/{l.total}
                  </span>
                  {" · "}
                  {l.etapeCourante ?? <span className="text-ink-3">aucune étape datée</span>}
                </>
              )}
            </Td>
            <Td secondaire>{l.gestionnaire ?? <span className="text-ink-3">non renseigné</span>}</Td>
            <Td secondaire>{l.agenceCode ?? <span className="text-ink-3">non renseignée</span>}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
