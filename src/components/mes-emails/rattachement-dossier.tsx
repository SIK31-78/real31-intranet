"use client";

import { useState } from "react";
import { Link2, FilePlus2 } from "lucide-react";
import Link from "next/link";
import type { MailEntrant, Rattachement } from "@/lib/domain/mes-emails";
import { LIBELLE_TYPE } from "@/lib/domain/mes-emails";
import { TYPE_DOSSIER_LABEL, TYPE_DOSSIER_ORDRE, type TypeDossier } from "@/lib/domain/dossier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

// Ligne meta (type du mail + dossier de suivi intranet rattache) et, quand on « change »,
// le picker des dossiers reels de la copro + le mini-formulaire de creation.
export function RattachementDossier({
  m,
  ratt,
  coproCode,
  dossiersReels,
  typeSuggere,
  changer,
  onToggleChanger,
  onRattacherDossier,
  onCreerDossier,
}: {
  m: MailEntrant;
  ratt: Rattachement;
  coproCode: string;
  dossiersReels: { id: string; titre: string; type: TypeDossier }[] | null;
  typeSuggere: TypeDossier;
  changer: boolean;
  onToggleChanger: () => void;
  onRattacherDossier: (dossierId: string, titre: string) => void;
  onCreerDossier: (type: TypeDossier, titre: string) => void;
}) {
  return (
    <>
      {/* Ligne meta discrete : type + rattachement modifiable */}
      <div className="flex items-center gap-2 flex-wrap text-body text-ink-3">
        <Badge ton="outline">{LIBELLE_TYPE[m.type]}</Badge>
        {ratt.intranet ? (
          <Link
            href={`/dossiers/${ratt.dossierId}`}
            className="inline-flex items-center gap-1 text-ink-2 hover:text-ink underline-offset-2 hover:underline"
          >
            <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
            {ratt.dossierLabel}
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1 text-ink-3">
            <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5 shrink-0" />
            non rattaché à un dossier
          </span>
        )}
        <Button onClick={onToggleChanger} variant="ghost">
          {changer ? "fermer" : ratt.intranet ? "changer" : "rattacher / créer"}
        </Button>
      </div>

      {changer && !coproCode && (
        <div className="rounded-md border border-dashed border-line px-3 py-2 text-body text-ink-3">
          Lier un <strong>dossier de suivi intranet</strong> nécessite une copropriété. Pour simplement
          <strong> ranger</strong> ce mail, utilise «&nbsp;Classer dans…&nbsp;» en haut - aucune copropriété requise.
        </div>
      )}

      {changer && coproCode && (
        <div className="rounded-md border border-line overflow-hidden">
          {dossiersReels === null ? (
            <p className="px-3 py-2 text-body text-ink-3">Chargement des dossiers…</p>
          ) : (
            <ul className="divide-y divide-line">
              {dossiersReels.map((d) => (
                <li key={d.id}>
                  <Button
                    onClick={() => onRattacherDossier(d.id, d.titre)}
                    variant="secondary" size="lg" className="w-full text-left"
                  >
                    <Link2 strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3 shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{d.titre}</span>
                    <Badge ton="outline">{TYPE_DOSSIER_LABEL[d.type]}</Badge>
                  </Button>
                </li>
              ))}
              {dossiersReels.length === 0 && (
                <li className="px-3 py-2 text-body text-ink-3">Aucun dossier sur cette copropriété.</li>
              )}
            </ul>
          )}
          <FormCreerDossier typeSuggere={typeSuggere} titreSuggere={m.objet} onCreer={onCreerDossier} />
        </div>
      )}
    </>
  );
}

// Mini-formulaire de creation d'un dossier reel depuis un mail (type pre-suggere +
// titre = objet du mail, editables).
function FormCreerDossier({
  typeSuggere,
  titreSuggere,
  onCreer,
}: {
  typeSuggere: TypeDossier;
  titreSuggere: string;
  onCreer: (type: TypeDossier, titre: string) => void;
}) {
  const [type, setType] = useState<TypeDossier>(typeSuggere);
  const [titre, setTitre] = useState(titreSuggere);
  return (
    <div className="border-t border-line bg-surface-2/40 px-3 py-2 flex flex-col gap-2">
      <p className="text-meta font-medium text-ink-3 flex items-center gap-1">
        <FilePlus2 strokeWidth={1.5} className="w-3.5 h-3.5 text-green-700" /> Créer un dossier
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value as TypeDossier)}
          aria-label="Type de dossier"
          largeur="auto"
        >
          {TYPE_DOSSIER_ORDRE.map((t) => (
            <option key={t} value={t}>
              {TYPE_DOSSIER_LABEL[t]}
            </option>
          ))}
        </Select>
        <Input
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          placeholder="Titre du dossier"
          aria-label="Titre du dossier"
          className="flex-1 min-w-[140px]"
        />
        <Button
          disabled={!titre.trim()}
          onClick={() => onCreer(type, titre.trim())}
          variant="secondary" size="sm"
        >
          Créer
        </Button>
      </div>
    </div>
  );
}
