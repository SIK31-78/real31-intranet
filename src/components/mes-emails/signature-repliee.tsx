"use client";

// La signature (Signitic) sous la réponse et le nouveau mail, REPLIÉE sur une ligne (29/10/2026) :
// le cadre blanc de 110 à 170 px poussait « Envoyer » plus bas à chaque mail, et personne ne
// relit sa signature à chaque envoi. Elle part toujours avec le mail ; « voir » l'affiche.

import { useState } from "react";

export function SignatureRepliee({ html, hauteur, libelle }: { html: string; hauteur: 110 | 170; libelle: string }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <div className="mt-2">
      <p className="text-meta text-ink-3">
        {libelle} ·{" "}
        <button type="button" onClick={() => setOuverte((o) => !o)} aria-expanded={ouverte} className="underline hover:text-ink">
          {ouverte ? "masquer" : "voir"}
        </button>
      </p>
      {ouverte ? (
        <iframe
          title="Signature"
          sandbox=""
          srcDoc={html}
          className={"mt-1 w-full rounded-md border border-line bg-white " + (hauteur === 170 ? "h-[170px]" : "h-[110px]")}
        />
      ) : null}
    </div>
  );
}
