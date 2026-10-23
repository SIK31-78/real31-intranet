"use client";

// « Historique de la conversation » : sous un mail reçu, les messages précédents qu'il cite,
// pour savoir à quoi il répond (Mahaut, 15/10/2026). Replié par défaut, lu au clic.

import { useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { chargerHistoriqueAction } from "@/app/mes-emails/actions";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";

export function HistoriqueMail({ emailId, boite }: { emailId: string; boite: string }) {
  const [ouvert, setOuvert] = useState(false);
  // undefined = pas encore demandé ; null = boîte illisible.
  const [texte, setTexte] = useState<string | null | undefined>(undefined);

  function basculer() {
    setOuvert((o) => !o);
    if (texte === undefined) void chargerHistoriqueAction(emailId, boite).then(setTexte);
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
              <TexteAvecLiens texte={texte} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
