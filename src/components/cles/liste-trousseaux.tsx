"use client";

// Tous les trousseaux de l'agence, filtres par etat (SegmentedControl) et par texte.
// Le filtre est client : quelques centaines de lignes, deja chargees par la page.

import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented";
import { Input } from "@/components/ui/field";
import { Rows } from "@/components/ui/list-rows";
import { EmptyState } from "@/components/ui/empty-state";
import { normaliserTexte } from "@/lib/domain/cles/normaliser";
import type { EtatTrousseau } from "@/lib/domain/cles/types";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import { LigneTrousseau } from "./ligne-trousseau";

type Filtre = "tous" | "en_agence" | "dehors" | "reserve" | "autres";

export function ListeTrousseaux({ resumes }: { resumes: TrousseauResume[] }) {
  const [filtre, setFiltre] = useState<Filtre | null>("tous");
  const [q, setQ] = useState("");
  const n = (etats: EtatTrousseau[]) => resumes.filter((r) => etats.includes(r.etat)).length;

  const visibles = useMemo(() => {
    const parEtat = resumes.filter((r) => {
      switch (filtre) {
        case "en_agence": return r.etat === "en_agence";
        case "dehors": return r.etat === "sorti" || r.etat === "en_retard";
        case "reserve": return r.etat === "reserve";
        case "autres": return r.etat === "introuvable" || r.etat === "retire";
        default: return r.etat !== "retire";
      }
    });
    const termes = normaliserTexte(q).split(" ").filter(Boolean);
    if (termes.length === 0) return parEtat;
    return parEtat.filter((r) => {
      const f = normaliserTexte(`${r.trousseau.numero} ${r.trousseau.libelle} ${r.trousseau.emplacement ?? ""} ${r.biens.map((b) => `${b.coproCode ?? ""} ${b.libelle} ${b.adresse}`).join(" ")} ${r.pret?.entrepriseNom ?? ""}`);
      return termes.every((t) => f.includes(t));
    });
  }, [resumes, filtre, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl<Filtre>
          label="Filtrer par état"
          value={filtre}
          onChange={(v) => setFiltre(v ?? "tous")}
          size="sm"
          options={[
            { value: "tous", label: `Tous · ${resumes.filter((r) => r.etat !== "retire").length}` },
            { value: "en_agence", label: `En agence · ${n(["en_agence"])}` },
            { value: "reserve", label: `Réservés · ${n(["reserve"])}` },
            { value: "dehors", label: `Sortis · ${n(["sorti", "en_retard"])}`, ton: n(["en_retard"]) > 0 ? "err" : undefined },
            { value: "autres", label: `Introuvables, retirés · ${n(["introuvable", "retire"])}` },
          ]}
        />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrer…" largeur="auto" className="sm:w-56" aria-label="Filtrer les trousseaux" />
      </div>
      {visibles.length === 0 ? (
        <EmptyState compact>Aucun trousseau ne correspond</EmptyState>
      ) : (
        <Rows>{visibles.map((r) => <LigneTrousseau key={r.trousseau.id} resume={r} />)}</Rows>
      )}
    </div>
  );
}
