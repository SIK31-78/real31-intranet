"use client";

import { useRef, useState } from "react";

/** Petit input inline partage (valeur de champ, libelle libre) : commit au blur /
 *  Entree, abandon a Echap. */
export function InputInline({
  initial,
  onCommit,
  onAbandon,
  placeholder,
  classe,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onAbandon: () => void;
  placeholder?: string;
  classe?: string;
}) {
  const [v, setV] = useState(initial);
  const commitRef = useRef(false);
  const commettre = () => {
    if (commitRef.current) return; // Entree PUIS blur : un seul commit
    commitRef.current = true;
    onCommit(v);
  };
  return (
    <input
       
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commettre}
      onKeyDown={(e) => {
        if (e.key === "Enter") commettre();
        if (e.key === "Escape") {
          commitRef.current = true;
          onAbandon();
        }
      }}
      placeholder={placeholder}
      className={
        classe ??
        "inline-block align-baseline min-w-[160px] max-w-full px-1 -mx-1 rounded-sm bg-green-700/5 font-medium text-ink text-[12px] leading-[1.55] outline-none ring-1 ring-green-700/40 focus:ring-green-700"
      }
    />
  );
}

/** Textarea multi-lignes pour les valeurs TEXTE : leur vrai ODJ CS est redige en
 *  paragraphes (retour collegue 2026-09-01, "le saut de ligne ne fonctionne pas").
 *  Entree = saut de ligne ; commit au blur ; abandon a Echap. */
export function TextareaInline({
  initial,
  onCommit,
  onAbandon,
}: {
  initial: string;
  onCommit: (v: string) => void;
  onAbandon: () => void;
}) {
  const [v, setV] = useState(initial);
  const commitRef = useRef(false);
  return (
    <textarea
       
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        if (commitRef.current) return;
        commitRef.current = true;
        onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          commitRef.current = true;
          onAbandon();
        }
      }}
      rows={Math.max(2, v.split("\n").length)}
      className="block w-full mt-0.5 px-2 py-1 rounded-sm bg-green-700/5 text-[12px] leading-[1.55] text-ink outline-none ring-1 ring-green-700/40 focus:ring-green-700 resize-y"
    />
  );
}
