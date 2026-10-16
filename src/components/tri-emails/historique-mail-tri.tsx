"use client";

// « Historique de la conversation » sous un mail de la file à trier (REA-352, 16/10/2026) :
// le même bloc que l'écran E-mails (components/mes-emails/historique-mail.tsx), branché sur
// l'action du tri qui lit la boîte générique. Replié par défaut, lu au clic : les fils sont
// parfois très longs et la file se parcourt vite. À monter avec key={internetMessageId}
// pour repartir de zéro à chaque mail.

import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { chargerHistoriqueTriAction } from "@/app/tri-emails/actions";

export function HistoriqueMailTri({ internetMessageId }: { internetMessageId: string }) {
  const [ouvert, setOuvert] = useState(false);
  // undefined = pas encore demandé ; null = boîte illisible.
  const [texte, setTexte] = useState<string | null | undefined>(undefined);

  function basculer() {
    setOuvert((o) => !o);
    if (texte === undefined) {
      void chargerHistoriqueTriAction({ internetMessageId }).then(
        (r) => setTexte(r.ok ? (r.donnees ?? "") : null),
        () => setTexte(null),
      );
    }
  }

  return (
    <div className="mt-3 border-t border-line pt-2">
      <button
        type="button"
        onClick={basculer}
        aria-expanded={ouvert}
        className="flex items-center gap-1.5 text-body font-medium text-ink-2 hover:text-ink"
      >
        <ChevronRight strokeWidth={1.5} className={`w-3.5 h-3.5 text-ink-3 transition-transform ${ouvert ? "rotate-90" : ""}`} />
        <History strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-3" />
        Historique de la conversation
      </button>
      {ouvert && (
        <div className="mt-2 pl-5">
          {texte === undefined ? (
            <p className="text-meta text-ink-3">Chargement de l&apos;historique…</p>
          ) : texte === null ? (
            <p className="text-meta text-ink-3">L&apos;historique n&apos;a pas pu être lu pour le moment.</p>
          ) : texte === "" ? (
            <p className="text-meta text-ink-3">Ce mail ne cite aucun message précédent.</p>
          ) : (
            <div className="text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[420px] overflow-auto border-l-2 border-line pl-3">
              {texte}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
