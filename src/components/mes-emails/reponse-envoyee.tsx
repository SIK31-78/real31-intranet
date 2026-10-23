"use client";

// « Réponse envoyée » : sous un mail répondu, la réponse partie de la boîte, pour savoir
// ce qui a été dit sans ouvrir Outlook (Sekou, 15/10/2026 : « qu'est-ce que Mylène a
// répondu ? »). Replié par défaut, la réponse n'est lue qu'au clic.

import { useState } from "react";
import { ChevronRight, CornerUpLeft, ExternalLink } from "lucide-react";
import type { ReponseEnvoyee as Reponse } from "@/lib/domain/echanges";
import { chargerReponsesEnvoyeesAction } from "@/app/mes-emails/actions";
import { TexteAvecLiens } from "@/components/mes-emails/texte-avec-liens";

function quand(iso: string): string {
  const d = new Date(iso);
  return `le ${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function ReponseEnvoyee({ emailId, boite }: { emailId: string; boite: string }) {
  const [ouvert, setOuvert] = useState(false);
  // undefined = pas encore demandée ; null = boîte illisible.
  const [reponses, setReponses] = useState<Reponse[] | null | undefined>(undefined);

  function basculer() {
    setOuvert((o) => !o);
    if (reponses === undefined) void chargerReponsesEnvoyeesAction(emailId, boite).then(setReponses);
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
        <CornerUpLeft strokeWidth={1.5} className="w-3.5 h-3.5 text-info-700" />
        Réponse envoyée
      </button>
      {ouvert && (
        <div className="mt-2 pl-5 flex flex-col gap-3">
          {reponses === undefined ? (
            <p className="text-meta text-ink-3">Chargement de la réponse…</p>
          ) : reponses === null ? (
            <p className="text-meta text-ink-3">La réponse n&apos;a pas pu être lue pour le moment.</p>
          ) : reponses.length === 0 ? (
            <p className="text-meta text-ink-3">
              Aucune réponse dans les éléments envoyés de {boite}. Elle est peut-être partie d&apos;une autre boîte.
            </p>
          ) : (
            reponses.map((r) => (
              <div key={r.date} className="rounded-md border border-line bg-surface-2 px-3 py-2">
                <p className="text-meta text-ink-3">
                  {quand(r.date)}, par <span className="text-ink-2">{r.deNom}</span>
                  {r.a.length ? <> à {r.a.join(", ")}</> : null}
                  {r.lienOutlook ? (
                    <a href={r.lienOutlook} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-info-700 hover:underline">
                      Outlook <ExternalLink strokeWidth={1.5} className="w-3 h-3" />
                    </a>
                  ) : null}
                </p>
                <div className="mt-1 text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[240px] overflow-auto">
                  {r.corps ? <TexteAvecLiens texte={r.corps} /> : <span className="italic text-ink-3">(réponse sans texte)</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
