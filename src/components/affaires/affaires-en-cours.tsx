"use client";

// Bloc 2 de l'accueil : "Vos dossiers en cours".
// Les dossiers (non clos) du gestionnaire, GROUPES en 3 segments orientes action
// (A traiter / En cours / A clore - cf. domain/dossier.segmentAffaire). Chaque ligne :
// type + copro + etape en cours + progression + lien vers le fil /dossiers/<id>.
// Filtres v1 : copro, type, toggle [Moi]/[Mon equipe] (un FILTRE, jamais vert).

import { useMemo, useState } from "react";
import { Briefcase } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import {
  TYPE_DOSSIER_LABEL,
  TYPE_DOSSIER_ORDRE,
  SEGMENT_AFFAIRE_LABEL,
  SEGMENT_AFFAIRE_ORDRE,
  indexEtapeEnCours,
  progressionDossier,
  type Dossier,
  type TypeDossier,
  type SegmentAffaire,
} from "@/lib/domain/dossier";

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
// Par segment, on n'affiche que les N premiers (depliable) pour ne pas noyer le
// gestionnaire - meme principe que le bandeau AG (retour patron).
const CAP_SEGMENT = 5;

export interface AffaireVue {
  dossier: Dossier;
  segment: SegmentAffaire;
}

// "Moi" / "Mon equipe" v1-light (faute de table d'attribution dediee #1) : on s'appuie sur
// l'assignation de l'ETAPE EN COURS. "Moi" = affaires dont l'etape courante est assignee
// au gestionnaire OU non assignee (par defaut a moi) ; "Mon equipe" = + celles en main de
// l'assistant.
//
// ATTENTION au libelle (corrige le 2026-07-28) : ce toggle filtre COTE CLIENT un jeu DEJA
// cloisonne par le serveur (getAffairesEnCours(managerId) -> getDossiers -> copros du
// gestionnaire). Il ne peut donc que RETRECIR, jamais elargir : ce n'est PAS "tout le
// cabinet". Il s'appelait "Tout", ce qui laissait croire a une vue transverse et faisait
// passer un portefeuille vide pour un bouton mort. Quand le canva d'attribution (#1)
// existera, ce filtre se branchera sur la vraie identite.
function etapeCouranteAssignee(d: Dossier): "gestionnaire" | "assistant" | undefined {
  const i = indexEtapeEnCours(d);
  return i === -1 ? undefined : d.etapes[i]?.assigneA;
}

type Portee = "moi" | "tout";

export function AffairesEnCours({ affaires }: { affaires: AffaireVue[] }) {
  const [filtreType, setFiltreType] = useState<"all" | TypeDossier>("all");
  const [filtreCopro, setFiltreCopro] = useState<"all" | string>("all");
  const [portee, setPortee] = useState<Portee>("moi");
  const [deplies, setDeplies] = useState<Set<SegmentAffaire>>(() => new Set());

  // Copros presentes dans les affaires (pour ne proposer que celles-la au filtre).
  const copros = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of affaires) m.set(a.dossier.coproCode, a.dossier.coproNom ?? "");
    return [...m.entries()].map(([code, nom]) => ({ code, nom })).sort((x, y) => x.code.localeCompare(y.code));
  }, [affaires]);

  const visibles = useMemo(
    () =>
      affaires.filter((a) => {
        const d = a.dossier;
        if (filtreType !== "all" && d.type !== filtreType) return false;
        if (filtreCopro !== "all" && d.coproCode !== filtreCopro) return false;
        if (portee === "moi") {
          const who = etapeCouranteAssignee(d);
          if (who === "assistant") return false; // etape courante a l'assistant -> pas "moi"
        }
        return true;
      }),
    [affaires, filtreType, filtreCopro, portee],
  );

  const parSegment = useMemo(() => {
    const m = new Map<SegmentAffaire, AffaireVue[]>(SEGMENT_AFFAIRE_ORDRE.map((s) => [s, []]));
    for (const a of visibles) m.get(a.segment)!.push(a);
    return m;
  }, [visibles]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <SegmentedControl<Portee>
          label="Périmètre des dossiers"
          value={portee}
          onChange={(v) => setPortee(v ?? "moi")}
          options={[
            { value: "moi", label: "Moi" },
            { value: "tout", label: "Mon équipe" },
          ]}
        />
        <Select
          aria-label="Type de dossier"
          value={filtreType}
          onChange={(e) => setFiltreType(e.target.value as typeof filtreType)}
          largeur="auto"
        >
          <option value="all">Tous les types</option>
          {TYPE_DOSSIER_ORDRE.map((t) => (
            <option key={t} value={t}>{TYPE_DOSSIER_LABEL[t]}</option>
          ))}
        </Select>
        {copros.length > 0 && (
          <Select
            aria-label="Copropriété"
            value={filtreCopro}
            onChange={(e) => setFiltreCopro(e.target.value)}
            largeur="auto"
          >
            <option value="all">Toutes les copros</option>
            {copros.map((c) => (
              <option key={c.code} value={c.code}>{c.code} - {c.nom}</option>
            ))}
          </Select>
        )}
        <span className="text-body text-ink-2 tabular-nums">
          {visibles.length} dossier{visibles.length > 1 ? "s" : ""}
        </span>
      </div>

      {visibles.length === 0 ? (
        <EmptyState icone={Briefcase}>Aucun dossier pour ce filtre</EmptyState>
      ) : (
        SEGMENT_AFFAIRE_ORDRE.map((seg) => {
          const items = parSegment.get(seg)!;
          if (items.length === 0) return null;
          const deplie = deplies.has(seg);
          const affiches = deplie ? items : items.slice(0, CAP_SEGMENT);
          const reste = items.length - affiches.length;
          return (
            <section key={seg} className="flex flex-col gap-1.5">
              <Eyebrow as="h3" className="px-1">
                {SEGMENT_AFFAIRE_LABEL[seg]} <span className="tabular-nums">({items.length})</span>
              </Eyebrow>
              <Rows>
                {affiches.map((a) => (
                  <LigneAffaire key={a.dossier.id} d={a.dossier} />
                ))}
              </Rows>
              {items.length > CAP_SEGMENT && (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDeplies((prev) => {
                        const next = new Set(prev);
                        if (next.has(seg)) next.delete(seg);
                        else next.add(seg);
                        return next;
                      })
                    }
                  >
                    {deplie ? "Réduire" : `Afficher les ${reste} de plus`}
                  </Button>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}

function LigneAffaire({ d }: { d: Dossier }) {
  const p = progressionDossier(d);
  const i = indexEtapeEnCours(d);
  const etapeEnCours = i === -1 ? "Tout fait" : d.etapes[i]?.label ?? "";

  return (
    <Row
      href={`/dossiers/${d.id}`}
      avant={
        <Badge ton={TYPE_TON[d.type]} className="w-24 justify-center font-sans">
          {TYPE_DOSSIER_LABEL[d.type]}
        </Badge>
      }
      principal={d.titre}
      secondaire={
        <>
          {d.coproCode} {d.coproNom ?? ""}
          {etapeEnCours ? ` · ${etapeEnCours}` : ""}
        </>
      }
      droite={
        <span className="hidden sm:flex items-center gap-2 w-32">
          <Progress valeur={p.pct} label={`${p.faites} étapes sur ${p.total}`} />
          <span className="text-meta text-ink-2 tabular-nums shrink-0">
            {p.faites}/{p.total}
          </span>
        </span>
      }
    />
  );
}
