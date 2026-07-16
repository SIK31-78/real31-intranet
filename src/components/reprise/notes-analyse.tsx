"use client";

// Affichage HIERARCHISE et depliable des notes d'analyse d'une reprise (anomalies + vigilances +
// infos). Remplace le "gros pave sans hierarchisation" : sections par NIVEAU (erreurs > anomalies >
// vigilances > infos), badges compteurs colores, regroupement discret par SOURCE, lignes aerees,
// filtre texte au-dela de 20 notes.
//
// Presentation pure : la CLASSIFICATION vit dans le domaine (classement-notes.ts, teste offline).
// Les alertes dediees (avant-repartition, grand livre non exploite, bandeau desequilibre) restent
// AU-DESSUS, gerees par l'appelant ; ce composant traite le tout-venant.
//
// PII : les libelles peuvent porter des noms (app interne authentifiee) ; ils sont affiches, jamais
// logues.

import { useMemo, useState } from "react";
import { ChevronDown, AlertTriangle, AlertCircle, Eye, Info, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import type { Ton } from "@/lib/domain/commun";
import {
  ORDRE_NIVEAUX,
  type NiveauNote,
  type NoteStructuree,
  type SourceNote,
} from "@/lib/reprise/domain/classement-notes";

const SEUIL_FILTRE = 20;

const NIVEAU_LABEL: Record<NiveauNote, string> = {
  erreur: "Erreurs",
  anomalie: "Anomalies",
  vigilance: "Points de vigilance",
  info: "Informations",
};

const NIVEAU_TON: Record<NiveauNote, Ton> = {
  erreur: "err",
  anomalie: "warn",
  vigilance: "info",
  info: "neutral",
};

const NIVEAU_ICONE: Record<NiveauNote, typeof AlertTriangle> = {
  erreur: AlertTriangle,
  anomalie: AlertCircle,
  vigilance: Eye,
  info: Info,
};

// Ouvert par defaut : erreurs + anomalies (ce qui demande une action) ; vigilances + infos replies.
const OUVERT_PAR_DEFAUT: Record<NiveauNote, boolean> = {
  erreur: true,
  anomalie: true,
  vigilance: false,
  info: false,
};

const SOURCE_LABEL: Record<SourceNote, string> = {
  patrimoine: "Patrimoine",
  proprietaires: "Coproprietaires",
  compta: "Compta",
  liaison: "Liaison",
  autre: "Autre",
};

// Couleur de la ligne selon le niveau (le badge de section porte deja le compteur colore).
const NIVEAU_TEXTE: Record<NiveauNote, string> = {
  erreur: "text-err-700",
  anomalie: "text-warn-700",
  vigilance: "text-ink-2",
  info: "text-ink-3",
};

export function NotesAnalyse({
  notes,
  titre = "Anomalies et points de vigilance",
}: {
  notes: NoteStructuree[];
  titre?: string;
}) {
  const [filtre, setFiltre] = useState("");

  const filtrees = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => n.texte.toLowerCase().includes(q));
  }, [notes, filtre]);

  // Regroupe par niveau (dans l'ordre de severite), puis par source a l'interieur.
  const parNiveau = useMemo(() => {
    return ORDRE_NIVEAUX.map((niveau) => {
      const duNiveau = filtrees.filter((n) => n.niveau === niveau);
      const parSource = new Map<SourceNote, NoteStructuree[]>();
      for (const n of duNiveau) {
        const liste = parSource.get(n.source) ?? [];
        liste.push(n);
        parSource.set(n.source, liste);
      }
      return { niveau, total: duNiveau.length, parSource };
    }).filter((g) => g.total > 0);
  }, [filtrees]);

  if (notes.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-2 flex-wrap">
        <h4 className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">{titre}</h4>
        <span className="text-[11px] text-ink-4">({notes.length})</span>
        {ORDRE_NIVEAUX.map((niveau) => {
          const n = notes.filter((x) => x.niveau === niveau).length;
          if (n === 0) return null;
          return (
            <Badge key={niveau} ton={NIVEAU_TON[niveau]} dot>
              {n} {NIVEAU_LABEL[niveau].toLowerCase()}
            </Badge>
          );
        })}
      </div>

      {notes.length > SEUIL_FILTRE && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-surface px-2.5 h-8 max-w-[320px]">
          <Search strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
          <input
            value={filtre}
            onChange={(e) => setFiltre(e.target.value)}
            placeholder="Filtrer les notes..."
            className="flex-1 bg-transparent text-[12.5px] text-ink outline-none"
            aria-label="Filtrer les notes"
          />
        </div>
      )}

      {filtre.trim() && filtrees.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-ink-3">Aucune note ne correspond au filtre.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {parNiveau.map((g) => (
            <SectionNiveau key={g.niveau} niveau={g.niveau} total={g.total} parSource={g.parSource} filtre={!!filtre.trim()} />
          ))}
        </div>
      )}
    </section>
  );
}

function SectionNiveau({
  niveau,
  total,
  parSource,
  filtre,
}: {
  niveau: NiveauNote;
  total: number;
  parSource: Map<SourceNote, NoteStructuree[]>;
  filtre: boolean;
}) {
  // Un filtre actif force l'ouverture (on veut voir les resultats meme dans une section repliee).
  const [ouvert, setOuvert] = useState(OUVERT_PAR_DEFAUT[niveau]);
  const deplie = ouvert || filtre;
  const Icone = NIVEAU_ICONE[niveau];

  return (
    <div className="rounded-md border border-line bg-surface">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={deplie}
      >
        <span className="flex items-center gap-2">
          <Icone strokeWidth={1.75} className={cn("w-3.5 h-3.5 shrink-0", NIVEAU_TEXTE[niveau])} />
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{NIVEAU_LABEL[niveau]}</span>
          <Badge ton={NIVEAU_TON[niveau]} dot>
            {total}
          </Badge>
        </span>
        <ChevronDown
          strokeWidth={1.5}
          className={cn("w-4 h-4 text-ink-4 transition-transform", deplie && "rotate-180")}
        />
      </button>

      {deplie && (
        <div className="border-t border-line px-3 py-2 flex flex-col gap-3">
          {[...parSource.entries()].map(([source, liste]) => (
            <div key={source}>
              <span className="inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">
                {SOURCE_LABEL[source]}
              </span>
              <ul className="mt-1.5 space-y-1.5">
                {liste.map((n, i) => (
                  <li key={i} className={cn("flex gap-2 text-[12.5px] leading-relaxed", NIVEAU_TEXTE[niveau])}>
                    <span aria-hidden className="text-ink-4 select-none">
                      -
                    </span>
                    <span className="min-w-0">{n.texte}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
