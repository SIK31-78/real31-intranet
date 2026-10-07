"use client";

// Les sorties de l'ODJ, en UN bouton qui ouvre la liste (REA-132). Il y a deux documents
// differents et il faut les nommer pour ne pas se tromper :
//   - l'ODJ REMPLI : ce qui est a l'ecran, avec les paragraphes libres et les saisies ;
//   - le MODELE du cabinet pre-rempli, avec ses blancs, qu'on finit de remplir en reunion.
// Les deux voies ont ete gardees au point du 01/10/2026. Les mettre en deux boutons cote a
// cote faisait six boutons dans l'en-tete et aucune indication de ce qui les distingue.
//
// Un <details> natif : ouverture au clavier et sans JS, et une seule ligne de script pour
// refermer le menu quand on clique ailleurs.

import { useEffect, useRef } from "react";
import { ChevronDown, FileDown, FileText, FileType } from "lucide-react";
import { classesBouton, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

export function TelechargementsOdj({
  id,
  variant = "primary",
  size = "md",
}: {
  id: string;
  /** `secondary` / `sm` dans la supervision d'AG : le primaire y est ailleurs. */
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const menu = useRef<HTMLDetailsElement>(null);

  // Clic en dehors ou Echap : on referme. Sans ca, le menu reste ouvert apres un
  // telechargement (un fichier ne fait pas naviguer la page, donc rien ne le referme).
  useEffect(() => {
    const fermer = (e: Event) => {
      const d = menu.current;
      if (!d?.open) return;
      if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return;
      if (e.type === "pointerdown" && d.contains(e.target as Node)) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", fermer);
    document.addEventListener("keydown", fermer);
    return () => {
      document.removeEventListener("pointerdown", fermer);
      document.removeEventListener("keydown", fermer);
    };
  }, []);

  return (
    <details ref={menu} className="relative">
      <summary className={`${classesBouton({ variant, size })} list-none [&::-webkit-details-marker]:hidden`}>
        <FileDown strokeWidth={1.5} />
        Télécharger
        <ChevronDown strokeWidth={1.5} />
      </summary>
      {/* Surface flottante : rayon 16 et shadow-2, comme la modale et les toasts. */}
      <div className="absolute right-0 z-20 mt-1 w-[19rem] rounded-xl border border-line bg-surface p-1 shadow-2">
        <Entree
          href={`/odj/${id}/odj-rempli.docx`}
          icone={<FileText strokeWidth={1.5} />}
          titre="L'ODJ rempli (Word)"
          aide="Tout ce qui a été saisi ici : valeurs, paragraphes libres, notes."
        />
        <Entree
          href={`/odj/${id}/odj-rempli.pdf`}
          icone={<FileType strokeWidth={1.5} />}
          titre="L'ODJ rempli (PDF)"
          aide="Le même document, non modifiable, pour l'envoyer au conseil syndical."
        />
        <div className="my-1 border-t border-line" />
        <Entree
          href={`/odj/${id}/odj-cs.docx`}
          icone={<FileText strokeWidth={1.5} />}
          titre="Le modèle du cabinet (Word)"
          aide="Pré-rempli par ESTALE, avec ses blancs : à compléter pendant la réunion."
        />
      </div>
    </details>
  );
}

function Entree({
  href,
  icone,
  titre,
  aide,
}: {
  href: string;
  icone: React.ReactNode;
  titre: string;
  aide: string;
}) {
  return (
    // Un <a> nu, pas un Link : ces routes rendent un FICHIER, elles ne se prefetchent pas.
    <a
      href={href}
      className="flex items-start gap-2.5 rounded-sm px-2.5 py-2 text-left hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
    >
      <span className="mt-0.5 text-ink-2 [&>svg]:h-4 [&>svg]:w-4">{icone}</span>
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink">{titre}</span>
        <span className="block text-meta text-ink-2">{aide}</span>
      </span>
    </a>
  );
}
