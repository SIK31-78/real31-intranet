"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Destinataires } from "@/lib/domain/mes-emails";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Editeur de destinataires de la reponse : A / Cc / Cci, chips + ajout/retrait.
export function ChampsDestinataires({
  valeur,
  onChange,
}: {
  valeur: Destinataires;
  onChange: (champ: keyof Destinataires, v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2 border border-line bg-surface rounded-md px-2.5 py-2">
      <LigneDest label="À" champ="to" valeurs={valeur.to} onChange={onChange} />
      <LigneDest label="Cc" champ="cc" valeurs={valeur.cc} onChange={onChange} />
      <LigneDest label="Cci" champ="cci" valeurs={valeur.cci} onChange={onChange} />
    </div>
  );
}

function LigneDest({
  label,
  champ,
  valeurs,
  onChange,
}: {
  label: string;
  champ: keyof Destinataires;
  valeurs: string[];
  onChange: (champ: keyof Destinataires, v: string[]) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const ajouter = () => {
    const e = saisie.trim().replace(/[,;]$/, "").trim();
    if (e && !valeurs.includes(e)) onChange(champ, [...valeurs, e]);
    setSaisie("");
  };
  return (
    <div className="flex items-start gap-2 min-h-[24px]">
      <span className="w-7 shrink-0 pt-1 text-meta font-medium text-ink-3">{label}</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {valeurs.map((e) => (
          <span
            key={e}
            className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-full bg-surface-3 text-meta text-ink-2"
          >
            <span className="truncate max-w-[200px]">{e}</span>
            <Button
              onClick={() => onChange(champ, valeurs.filter((x) => x !== e))}
              aria-label={`Retirer ${e}`}
              variant="danger"
            >
              <X strokeWidth={2} className="w-3 h-3" />
            </Button>
          </span>
        ))}
        <Input
          value={saisie}
          onChange={(ev) => setSaisie(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" || ev.key === "," || ev.key === ";") {
              ev.preventDefault();
              ajouter();
            }
          }}
          onBlur={ajouter}
          placeholder="ajouter une adresse…"
          className="flex-1 min-w-[120px]"
        />
      </div>
    </div>
  );
}
