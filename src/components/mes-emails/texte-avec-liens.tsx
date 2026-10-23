// Le texte brut d'un mail, ses liens rendus cliquables (REA-408). Le texte reste du texte :
// le parent garde son whitespace-pre-wrap, seuls les liens http(s) et mailto deviennent des
// <a> (découpe pure : domain/mes-emails-liens). Aucun HTML du mail n'est interprété.

import { Fragment } from "react";
import { decouperLiens } from "@/lib/domain/mes-emails-liens";

export function TexteAvecLiens({ texte }: { texte: string }) {
  return (
    <>
      {decouperLiens(texte).map((m, i) =>
        m.type === "texte" ? (
          <Fragment key={i}>{m.texte}</Fragment>
        ) : (
          <a
            key={i}
            href={m.href}
            target="_blank"
            rel="noopener noreferrer"
            title={m.href.length > 200 ? `${m.href.slice(0, 200)}…` : m.href}
            className="text-info-700 underline underline-offset-2 break-all hover:text-ink"
          >
            {m.texte}
          </a>
        ),
      )}
    </>
  );
}
