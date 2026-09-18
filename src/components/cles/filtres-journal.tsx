"use client";

// Filtres du journal : type, periode, auteur. Ils voyagent en query (URL partageable).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { TYPES_MOUVEMENT } from "@/lib/domain/cles/types";

const LIBELLES: Record<(typeof TYPES_MOUVEMENT)[number], string> = {
  creation: "Création", modification: "Modification", composition_modifiee: "Composition", reservation: "Réservation", annulation_reservation: "Annulation", sortie: "Sortie", prolongation: "Report de retour", retour: "Retour", introuvable: "Introuvable", retrouve: "Retrouvé", retrait: "Retrait", correction: "Correction", relance: "Relance", import: "Reprise PowerApps",
};

export function FiltresJournal(init: { type: string; de: string; a: string; par: string }) {
  const router = useRouter();
  const [type, setType] = useState(init.type);
  const [de, setDe] = useState(init.de);
  const [a, setA] = useState(init.a);
  const [par, setPar] = useState(init.par);
  function appliquer() {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    if (de) q.set("de", de);
    if (a) q.set("a", a);
    if (par.trim()) q.set("par", par.trim());
    router.push(`/cles/journal${q.size ? `?${q}` : ""}`);
  }
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); appliquer(); }}>
      <Field label="Type" htmlFor="j-type">
        <Select id="j-type" value={type} onChange={(e) => setType(e.target.value)} largeur="auto">
          <option value="">Tous</option>
          {TYPES_MOUVEMENT.map((t) => <option key={t} value={t}>{LIBELLES[t]}</option>)}
        </Select>
      </Field>
      <Field label="Du" htmlFor="j-de"><Input id="j-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} largeur="auto" /></Field>
      <Field label="Au" htmlFor="j-a"><Input id="j-a" type="date" value={a} onChange={(e) => setA(e.target.value)} largeur="auto" /></Field>
      <Field label="Par" htmlFor="j-par"><Input id="j-par" value={par} onChange={(e) => setPar(e.target.value)} placeholder="Nom du collaborateur" largeur="auto" /></Field>
      <Button type="submit" variant="secondary">Filtrer</Button>
      {(type || de || a || par) && <Button type="button" variant="ghost" onClick={() => router.push("/cles/journal")}>Effacer</Button>}
    </form>
  );
}
