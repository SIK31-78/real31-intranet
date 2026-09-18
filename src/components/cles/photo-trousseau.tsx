"use client";

// La photo du trousseau : un clic l'agrandit dans une modale (Echap ou clic pour fermer),
// sans quitter la fiche.

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Modal, ModalBody } from "@/components/ui/modal";

export function PhotoTrousseau({ url, numero }: { url: string; numero: string }) {
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOuverte(true)}
        className="group relative block w-full rounded-md overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
        aria-label={`Agrandir la photo du trousseau ${numero}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`Photo du trousseau ${numero}`} className="w-full max-h-64 object-cover transition-transform duration-180 group-hover:scale-[1.02]" />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-sm bg-surface/90 px-1.5 py-0.5 text-meta text-ink-2 shadow-1">
          <Maximize2 strokeWidth={1.5} className="w-3 h-3" aria-hidden /> Agrandir
        </span>
      </button>
      {ouverte && (
        <Modal titre={`Trousseau ${numero}`} onFermer={() => setOuverte(false)} size="lg">
          <ModalBody>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Photo du trousseau ${numero}`} className="mx-auto max-h-[75vh] w-auto max-w-full rounded-md object-contain cursor-zoom-out" onClick={() => setOuverte(false)} />
          </ModalBody>
        </Modal>
      )}
    </>
  );
}
