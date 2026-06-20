"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil } from "lucide-react";
import type { ChampOdj, SourceDonnee } from "@/lib/domain/odj";
import { formatChampValeur } from "@/lib/domain/odj";

const SOURCE_LABEL: Record<SourceDonnee, { texte: string; cls: string }> = {
  supabase: { texte: "auto", cls: "bg-ok-50 text-ok-700" },
  jalon: { texte: "auto (jalon)", cls: "bg-ok-50 text-ok-700" },
  calcul: { texte: "calculé", cls: "bg-ok-50 text-ok-700" },
  estale: { texte: "à venir (Estale)", cls: "bg-info-50 text-info-700" },
  manuel: { texte: "à saisir", cls: "bg-surface-2 text-ink-3" },
};

export function LigneChamp({
  champ,
  onSaisir,
}: {
  champ: ChampOdj;
  onSaisir: (champId: string, valeur: string) => Promise<void>;
}) {
  const [edition, setEdition] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, startTransition] = useTransition();
  const src = SOURCE_LABEL[champ.source];
  const affiche = formatChampValeur(champ);

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      await onSaisir(champ.id, draft);
      setEdition(false);
    });
  };

  // Booleen (ex. visio) : bouton on/off direct, pas de formulaire.
  if (champ.type === "booleen") {
    const actif = champ.valeur === "oui";
    return (
      <div className={`px-4 py-2 border-b border-line last:border-b-0 ${pending ? "opacity-60" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-ink-2 flex-1 min-w-0">{champ.libelle}</span>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onSaisir(champ.id, actif ? "non" : "oui");
              })
            }
            aria-pressed={actif}
            className={`h-7 px-3 rounded-full border text-[12px] font-medium transition-colors disabled:opacity-50 ${
              actif
                ? "bg-ok-50 text-ok-700 border-ok-500/30"
                : "bg-surface text-ink-3 border-line hover:border-line-2"
            }`}
          >
            {actif ? "Visio : oui" : "Visio : non"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-4 py-2 border-b border-line last:border-b-0 ${pending ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-ink-2 flex-1 min-w-0">{champ.libelle}</span>
        {!edition && (
          <span className="text-[13px] text-ink shrink-0 max-w-[45%] text-right whitespace-pre-wrap">
            {affiche ?? <span className="text-ink-4 italic">-</span>}
          </span>
        )}
        {champ.editable && !edition && (
          <button
            type="button"
            onClick={() => {
              setDraft(champ.valeur ?? "");
              setEdition(true);
            }}
            className="text-ink-3 hover:text-ink-2 shrink-0"
            title="Saisir / modifier"
          >
            <Pencil strokeWidth={1.5} className="w-3.5 h-3.5" />
          </button>
        )}
        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm shrink-0 ${src.cls}`}>{src.texte}</span>
      </div>
      {champ.alerte && !edition && (
        <p className="mt-1 text-[11.5px] text-warn-700">⚠ {champ.alerte}</p>
      )}
      {edition && (
        <form onSubmit={enregistrer} className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            aria-label={champ.libelle}
            inputMode={champ.type === "montant" || champ.type === "pourcentage" ? "decimal" : "text"}
            className="flex-1 h-8 px-2.5 rounded-sm border border-line bg-surface text-[12.5px] focus:outline-none focus:border-line-2"
            placeholder={
              champ.type === "montant"
                ? "ex. 4500 ou 4 500,50 (affiche en euros)"
                : champ.type === "pourcentage"
                  ? "ex. 3 ou 3,5"
                  : "Vider pour revenir a la valeur auto"
            }
          />
          <button
            type="submit"
            disabled={pending}
            className="h-8 px-3 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 disabled:opacity-50"
          >
            OK
          </button>
          <button
            type="button"
            onClick={() => setEdition(false)}
            className="h-8 px-2.5 rounded-sm border border-line text-[12px] text-ink-2 hover:border-line-2"
          >
            Annuler
          </button>
        </form>
      )}
    </div>
  );
}
