"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

// Recherche libre + filtres copropriete / entreprise sur les secrets, tous coffres.
export function BarreFiltres({
  recherche,
  onRecherche,
  filtreCopro,
  onFiltreCopro,
  coprosDispo,
  filtreEntreprise,
  onFiltreEntreprise,
  entreprisesDispo,
  filtreActif,
  onReinitialiser,
}: {
  recherche: string;
  onRecherche: (v: string) => void;
  filtreCopro: string;
  onFiltreCopro: (v: string) => void;
  coprosDispo: string[];
  filtreEntreprise: string;
  onFiltreEntreprise: (v: string) => void;
  entreprisesDispo: string[];
  filtreActif: boolean;
  onReinitialiser: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-3" strokeWidth={1.5} />
        <Input
          type="text"
          value={recherche}
          onChange={(e) => onRecherche(e.target.value)}
          placeholder="Rechercher (entreprise, identifiant, URL...)"

        />
      </div>
      {coprosDispo.length > 0 && (
        <Select
          value={filtreCopro}
          onChange={(e) => onFiltreCopro(e.target.value)}
          largeur="auto"
        >
          <option value="">Toutes les coproprietes</option>
          {coprosDispo.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      )}
      {entreprisesDispo.length > 0 && (
        <Select
          value={filtreEntreprise}
          onChange={(e) => onFiltreEntreprise(e.target.value)}
          largeur="auto"
        >
          <option value="">Toutes les entreprises</option>
          {entreprisesDispo.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>
      )}
      {filtreActif && (
        <Button
          onClick={onReinitialiser}
          variant="ghost" size="lg"
        >
          Reinitialiser
        </Button>
      )}
    </div>
  );
}
