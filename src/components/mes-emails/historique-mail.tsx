"use client";

// « Historique de la conversation » : sous un mail reçu, les messages précédents qu'il cite,
// pour savoir à quoi il répond (Mahaut, 15/10/2026). Replié par défaut, lu au clic.
// 27/10/2026 : un bloc de texte cité se lisait comme un mur ; chaque message cité a maintenant
// sa carte (qui, quand, à qui, puis le texte), du plus récent au plus ancien tel que cité.

import { useMemo, useState } from "react";
import { ChevronRight, History } from "lucide-react";
import { chargerHistoriqueAction } from "@/app/mes-emails/actions";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";
import { decouperHistorique, type MessageCite } from "@/lib/domain/mes-emails-historique";

export function HistoriqueMail({ emailId, boite }: { emailId: string; boite: string }) {
  const [ouvert, setOuvert] = useState(false);
  // undefined = pas encore demandé ; null = boîte illisible.
  const [texte, setTexte] = useState<string | null | undefined>(undefined);
  const messages = useMemo(() => (texte ? decouperHistorique(texte) : []), [texte]);

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
        {texte && messages.length > 0 ? <span className="text-ink-3 font-normal">· {messages.length}</span> : null}
      </button>
      {ouvert && (
        <div className="mt-2 pl-5">
          {texte === undefined ? (
            <p className="text-meta text-ink-3">Chargement de l&apos;historique…</p>
          ) : texte === null ? (
            <p className="text-meta text-ink-3">L&apos;historique n&apos;a pas pu être lu pour le moment.</p>
          ) : messages.length === 0 ? (
            <p className="text-meta text-ink-3">Ce mail ne cite aucun message précédent.</p>
          ) : (
            <ol className="flex flex-col gap-2 max-h-[480px] overflow-auto">
              {messages.map((msg, i) => (
                <li key={i}>
                  <CarteMessage msg={msg} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

/** Un message cité : l'en-tête quand le client mail l'a laissé, puis le texte tel quel. */
function CarteMessage({ msg }: { msg: MessageCite }) {
  const avecEnTete = msg.de || msg.date || msg.a || msg.objet;
  return (
    <article className="rounded-md border border-line bg-surface-2/40">
      {avecEnTete ? (
        <header className="px-3 py-1.5 border-b border-line text-meta leading-relaxed">
          <p className="break-words">
            <span className="font-semibold text-ink">{msg.de ?? "Expéditeur inconnu"}</span>
            {msg.date ? <span className="text-ink-3"> · {msg.date}</span> : null}
          </p>
          {msg.a ? (
            <p className="text-ink-3 break-words">
              <span>À : </span>
              <span className="text-ink-2">{msg.a}</span>
            </p>
          ) : null}
          {msg.objet ? (
            <p className="text-ink-3 break-words">
              <span>Objet : </span>
              <span className="text-ink-2">{msg.objet}</span>
            </p>
          ) : null}
        </header>
      ) : null}
      {msg.corps ? (
        <div className="px-3 py-2 text-body text-ink-2 whitespace-pre-wrap leading-relaxed">
          <TexteAvecLiens texte={msg.corps} />
        </div>
      ) : null}
    </article>
  );
}
