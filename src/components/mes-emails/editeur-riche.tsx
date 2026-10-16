"use client";

// Éditeur de texte mis en forme du compositeur et de la réponse (REA-345, 16/10/2026, en
// pilote) : gras, italique, liste à puces, lien. Un simple contenteditable et les commandes
// d'édition du navigateur, sans dépendance : le besoin est petit, et tout ce qui en sort
// repasse par nettoyerHtmlMail (au collage ici, avant l'envoi sur le serveur).
//
// Contrôlé « à moitié » : le HTML reçu n'est réécrit dans la zone que s'il diffère de ce
// qu'elle contient (un modèle appliqué, un brouillon IA) ; pendant la frappe on n'y touche
// pas, sinon le curseur sauterait au début à chaque lettre.

import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List } from "lucide-react";
import { lienSur, nettoyerHtmlMail, texteVersHtml } from "@/lib/domain/mes-emails-html";
import { cn } from "@/lib/cn";

export function EditeurRiche({
  html,
  onChange,
  onBlur,
  placeholder,
  label,
  hauteur = "min-h-40",
}: {
  html: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  label: string;
  /** Hauteur minimale de la zone (classe Tailwind). */
  hauteur?: string;
}) {
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = zone.current;
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  function emettre() {
    if (zone.current) onChange(zone.current.innerHTML);
  }

  function commande(nom: string, valeur?: string) {
    zone.current?.focus();
    // execCommand est ancien mais reste la seule commande d'édition commune à tous les
    // navigateurs sans bibliothèque ; il agit sur la sélection de la zone.
    document.execCommand(nom, false, valeur);
    emettre();
  }

  function lien() {
    const saisie = window.prompt("Adresse du lien (https://… ou mailto:…)");
    if (!saisie) return;
    const href = lienSur(saisie.trim());
    if (!href) {
      window.alert("Seuls les liens https://, http:// et mailto: sont acceptés.");
      return;
    }
    commande("createLink", href);
  }

  return (
    <div className="rounded-md border border-line focus-within:ring-2 focus-within:ring-green-600">
      <div role="toolbar" aria-label="Mise en forme" className="flex items-center gap-0.5 border-b border-line px-1.5 py-1">
        <BoutonForme titre="Gras (Ctrl+B)" onClick={() => commande("bold")}>
          <Bold strokeWidth={2} className="w-3.5 h-3.5" />
        </BoutonForme>
        <BoutonForme titre="Italique (Ctrl+I)" onClick={() => commande("italic")}>
          <Italic strokeWidth={2} className="w-3.5 h-3.5" />
        </BoutonForme>
        <BoutonForme titre="Liste à puces" onClick={() => commande("insertUnorderedList")}>
          <List strokeWidth={2} className="w-3.5 h-3.5" />
        </BoutonForme>
        <BoutonForme titre="Lien" onClick={lien}>
          <Link2 strokeWidth={2} className="w-3.5 h-3.5" />
        </BoutonForme>
      </div>
      <div
        ref={zone}
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emettre}
        onBlur={onBlur}
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onPaste={(e) => {
          // Un collage depuis Word ou une page web arrive chargé de styles : on ne garde que
          // la liste blanche, comme à l'envoi.
          e.preventDefault();
          const riche = e.clipboardData.getData("text/html");
          const propre = riche ? nettoyerHtmlMail(riche) : texteVersHtml(e.clipboardData.getData("text/plain"));
          document.execCommand("insertHTML", false, propre);
          emettre();
        }}
        className={cn(
          "px-2.5 py-1.5 text-body text-ink leading-5 outline-none overflow-auto max-h-[50vh] resize-y",
          "[&_p]:m-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-info-700 [&_a]:underline",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-ink-3",
          hauteur,
        )}
      />
    </div>
  );
}

function BoutonForme({ titre, onClick, children }: { titre: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      // Garder la sélection dans la zone : sans ça, le clic la déplace sur le bouton.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="h-7 w-7 inline-flex items-center justify-center rounded text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {children}
    </button>
  );
}
