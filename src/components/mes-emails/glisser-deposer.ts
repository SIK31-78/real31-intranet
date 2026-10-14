"use client";

// Glisser-déposer du module E-mails : des fichiers de l'ordinateur vers une réponse ou un
// nouveau mail, et un destinataire d'un champ à l'autre (À, Cc, Cci), comme dans Outlook.

import { useState, type DragEvent } from "react";

/** Type MIME propre aux destinataires glissés : un fichier ou un texte ne s'y confond pas. */
export const TYPE_DESTINATAIRE = "application/x-real31-destinataire";

/** Zone qui accepte des fichiers déposés. `survol` sert à la mettre en évidence. */
export function useDepotFichiers(onFichiers: (l: FileList) => void) {
  const [survol, setSurvol] = useState(false);
  const avecFichiers = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  return {
    survol,
    zone: {
      onDragOver: (e: DragEvent) => {
        if (!avecFichiers(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setSurvol(true);
      },
      onDragLeave: (e: DragEvent) => {
        // On ne sort vraiment que si le pointeur quitte la zone, pas un de ses enfants.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
      },
      onDrop: (e: DragEvent) => {
        if (!avecFichiers(e)) return;
        e.preventDefault();
        setSurvol(false);
        if (e.dataTransfer.files.length) onFichiers(e.dataTransfer.files);
      },
    },
  };
}

/** Un champ de destinataires qui reçoit une pastille glissée depuis un autre champ. */
export function useDepotDestinataire(champ: string, onDeplacer: (depuis: string, cle: string) => void) {
  const [survol, setSurvol] = useState(false);
  const estDestinataire = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(TYPE_DESTINATAIRE);
  return {
    survol,
    zone: {
      onDragOver: (e: DragEvent) => {
        if (!estDestinataire(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setSurvol(true);
      },
      onDragLeave: (e: DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSurvol(false);
      },
      onDrop: (e: DragEvent) => {
        if (!estDestinataire(e)) return;
        e.preventDefault();
        setSurvol(false);
        try {
          const { depuis, cle } = JSON.parse(e.dataTransfer.getData(TYPE_DESTINATAIRE)) as { depuis: string; cle: string };
          if (depuis !== champ) onDeplacer(depuis, cle);
        } catch {
          // Donnée illisible : on ignore le dépôt.
        }
      },
    },
  };
}

/** Attributs d'une pastille de destinataire qu'on peut glisser vers un autre champ. */
export function pastilleGlissable(champ: string, cle: string) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(TYPE_DESTINATAIRE, JSON.stringify({ depuis: champ, cle }));
      e.dataTransfer.effectAllowed = "move";
    },
  };
}
