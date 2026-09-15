"use client";

// Editer un contrat depuis la liste, sans passer par la fiche : on choisit la copro, les
// trois valeurs se pre-remplissent, on edite. C'est le geste du `NewContractScreen`
// MYTHEC (code entite + date d'AG + honoraires + timbres), demande par Sekou le 14/09/2026
// en tete de /contrat. Le formulaire est le MEME que sur /contrat/<code> : le `key` sur
// la copro le reinitialise a chaque changement.

import { useState } from "react";
import { Field, Select } from "@/components/ui/field";
import { FormulaireContrat } from "./formulaire-contrat";
import type { LigneContratAPreparer } from "@/lib/services/contrat/lister-contrats";

export function EditionRapideContrat({ lignes }: { lignes: LigneContratAPreparer[] }) {
  const [code, setCode] = useState("");
  const ligne = lignes.find((l) => l.coproCode === code) ?? null;
  // Par code : c'est comme ca que les gestionnaires nomment les copros.
  const triees = [...lignes].sort((a, b) => a.coproCode.localeCompare(b.coproCode));

  return (
    <div className="flex flex-col gap-4">
      <Field label="Copropriété">
        <Select value={code} onChange={(e) => setCode(e.target.value)} largeur="auto">
          <option value="">Choisir…</option>
          {triees.map((l) => (
            <option key={l.coproCode} value={l.coproCode}>
              {l.coproCode} · {l.nom}
            </option>
          ))}
        </Select>
      </Field>
      {ligne && (
        <FormulaireContrat
          key={ligne.coproCode}
          coproCode={ligne.coproCode}
          dateAgISO={ligne.dateAgISO ?? ""}
          debutISO={ligne.debutISO}
          finISO={ligne.finISO}
          honorairesTtc={ligne.honorairesTtc ?? 0}
          forfaitPostauxTtc={ligne.forfaitPostauxTtc ?? 0}
          fraisPostauxReels={ligne.derniereEdition?.fraisPostauxReels ?? false}
        />
      )}
    </div>
  );
}
