"use client";

// « Images du mail » (REA-328) : les photos collées dans le corps, en vignettes sous le texte.
// Le texte reste l'affichage du mail ; un clic ouvre la photo dans la visionneuse des pièces
// jointes. Rien ne s'affiche si le mail n'a pas de photo.

import { useEffect, useState } from "react";
import type { PieceJointeRef } from "@/lib/domain/mes-emails";
import { chargerImagesMailAction, telechargerPieceJointeAction } from "@/app/mes-emails/actions";

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
  const [contenus, setContenus] = useState<Record<string, string>>({});

  useEffect(() => {
    let actif = true;
    void chargerImagesMailAction(emailId, coproCode, boite).then(async (liste) => {
      if (!actif) return;
      setImages(liste);
      // Une vignette après l'autre : une photo de plusieurs Mo ne bloque pas les suivantes.
      for (const pj of liste) {
        const r = await telechargerPieceJointeAction(emailId, coproCode, pj.id, boite);
        if (!actif) return;
        if (r.ok && r.base64) setContenus((c) => ({ ...c, [pj.id]: `data:${r.type ?? pj.type};base64,${r.base64}` }));
      }
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
            {contenus[pj.id] ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URI d'une pièce jointe, pas une image du site
              <img src={contenus[pj.id]} alt={pj.nom} className="w-full h-full object-cover" />
            ) : (
              <span className="text-meta text-ink-3">…</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
