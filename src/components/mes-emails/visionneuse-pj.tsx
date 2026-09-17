"use client";

import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ApercuPj = { nom: string; type: string; url: string };

// Modale d'apercu d'une piece jointe (PDF en iframe, image en <img>, sinon telechargement).
// Le blob (URL objet) est cree et revoque par l'orchestrateur.
export function VisionneusePj({
  apercu,
  onFermer,
}: {
  apercu: ApercuPj | null;
  onFermer: () => void;
}) {
  if (!apercu) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`Aperçu ${apercu.nom}`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={onFermer} />
      <div className="relative flex flex-col w-full max-w-[920px] h-[85vh] rounded-lg border border-line bg-surface shadow-2 overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-line shrink-0">
          <span className="text-body font-medium text-ink truncate">{apercu.nom}</span>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={apercu.url}
              download={apercu.nom}
              className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-line text-body text-ink-2 hover:bg-surface-2"
            >
              <Download strokeWidth={1.5} className="w-3.5 h-3.5" /> Télécharger
            </a>
            <Button
              onClick={onFermer}
              aria-label="Fermer"
              variant="secondary" size="sm" iconOnly className="w-7"
            >
              <X strokeWidth={1.5} className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-surface-2">
          {apercu.type === "application/pdf" ? (
            <iframe src={apercu.url} title={apercu.nom} className="w-full h-full" />
          ) : apercu.type.startsWith("image/") ? (
            <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apercu.url} alt={apercu.nom} className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-body text-ink-3 px-4 text-center">
              <p>Aperçu non disponible pour ce type de fichier.</p>
              <a href={apercu.url} download={apercu.nom} className="text-green-700 hover:underline">
                Télécharger «&nbsp;{apercu.nom}&nbsp;»
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
