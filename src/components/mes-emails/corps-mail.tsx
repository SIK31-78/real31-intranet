"use client";

// Le corps d'un mail reçu (REA-328) : tel qu'il a été écrit, en HTML (photos collées,
// signatures, mise en forme), dans une iframe sans script ni formulaire. « Texte seul »
// revient à l'affichage d'avant. Pendant le chargement, ou si le HTML n'est pas lisible,
// le texte s'affiche.

import { useEffect, useState } from "react";
import { AlignLeft, Image as ImageIcon } from "lucide-react";
import { chargerHtmlAction } from "@/app/mes-emails/actions";

export function CorpsMail({ emailId, boite, texte }: { emailId: string; boite: string; texte: string }) {
  // undefined = en cours ; null ou "" = pas de HTML lisible : le texte suffit.
  const [html, setHtml] = useState<string | null | undefined>(undefined);
  const [texteSeul, setTexteSeul] = useState(false);

  useEffect(() => {
    let actif = true;
    void chargerHtmlAction(emailId, boite).then((h) => {
      if (actif) setHtml(h);
    });
    return () => {
      actif = false;
    };
  }, [emailId, boite]);

  const avecHtml = typeof html === "string" && html !== "";

  return (
    <div>
      {avecHtml && (
        <div className="flex justify-end mb-1.5">
          <button
            type="button"
            onClick={() => setTexteSeul((t) => !t)}
            className="inline-flex items-center gap-1 text-meta text-ink-3 hover:text-ink"
          >
            {texteSeul ? <ImageIcon strokeWidth={1.5} className="w-3.5 h-3.5" /> : <AlignLeft strokeWidth={1.5} className="w-3.5 h-3.5" />}
            {texteSeul ? "Mise en forme" : "Texte seul"}
          </button>
        </div>
      )}
      {avecHtml && !texteSeul ? (
        <iframe
          title="Contenu du mail"
          // Ni script ni formulaire ; les liens s'ouvrent dans un nouvel onglet.
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={html}
          className="w-full h-[480px] resize-y rounded-md border border-line bg-white"
        />
      ) : (
        <div className="text-body text-ink-2 whitespace-pre-wrap leading-relaxed max-h-[340px] overflow-auto">{texte}</div>
      )}
    </div>
  );
}
