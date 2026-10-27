"use client";

// « Images du mail » (REA-328) : les photos collées dans le corps, en vignettes sous le texte.
// Le texte reste l'affichage du mail ; un clic ouvre la photo dans la visionneuse des pièces
// jointes. Rien ne s'affiche si le mail n'a pas de photo. Chaque vignette se charge en flux
// depuis /mes-emails/pj (REA-421, 27/10/2026) : plus de base64, le navigateur met l'image en
// cache le temps de la page et une photo de 10 Mo ne bloque plus les suivantes.

import { useEffect, useState } from "react";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { chargerImagesMailAction } from "@/app/mes-emails/actions";
import { urlPieceJointe } from "@/lib/domain/piece-jointe-flux";

export function ImagesMail({
  emailId,
  coproCode,
  boite,
  onApercu,
}: {
  emailId: string;
  coproCode: string;
  boite: string;
  onApercu: (pj: PieceJointeRef) => void;
}) {
  const [images, setImages] = useState<PieceJointeRef[]>([]);

  useEffect(() => {
    let actif = true;
    void chargerImagesMailAction(emailId, coproCode, boite).then((liste) => {
      if (actif) setImages(liste);
    });
    return () => {
      actif = false;
    };
  }, [emailId, coproCode, boite]);

  if (images.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-meta text-ink-3 mb-1.5">Images du mail ({images.length})</p>
      <div className="flex flex-wrap gap-2">
        {images.map((pj) => (
          <button
            key={pj.id}
            type="button"
            onClick={() => onApercu(pj)}
            title={pj.nom}
            className="w-24 h-24 rounded-md border border-line bg-surface-2 overflow-hidden hover:border-green-600"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- pièce jointe servie par l'intranet, pas une image du site */}
            <img
              src={urlPieceJointe("mes-emails", { boite, message: emailId, pj: pj.id, inline: true })}
              alt={pj.nom}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
