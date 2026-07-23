"use client";

// Modale accessible du design system : dialog vrai (role="dialog", aria-modal),
// Escape ferme, clic sur le fond ferme, focus pose a l'ouverture et piege dans la
// fenetre (Tab cycle sans sortir). Contenu long -> corps scrollable. Reprend les
// tokens et le style de confirm.tsx (surface / line / ink / green).

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

const FOCUSABLES =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Modal({
  titre,
  onFermer,
  children,
}: {
  titre: string;
  onFermer: () => void;
  children: ReactNode;
}) {
  const panneauRef = useRef<HTMLDivElement>(null);
  // `onFermer` peut etre recree a chaque render par l'appelant (fonction inline).
  // On le lit via une ref pour ne PAS le mettre dans les deps du useEffect : sinon
  // l'effet (donc le focus initial) se re-declenche a chaque frappe et le focus
  // repart sur le premier element focusable (la croix). Bug corrige 2026-07-23.
  const onFermerRef = useRef(onFermer);
  useEffect(() => {
    onFermerRef.current = onFermer;
  }, [onFermer]);

  const focusables = useCallback((): HTMLElement[] => {
    const el = panneauRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLES)).filter(
      (n) => n.offsetParent !== null || n === document.activeElement,
    );
  }, []);

  useEffect(() => {
    // Pose le focus dans la modale a l'ouverture SEULEMENT (deps stables = montage).
    const cibles = focusables();
    (cibles[0] ?? panneauRef.current)?.focus();

    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFermerRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Piege le focus : Tab depuis le dernier revient au premier, Shift+Tab inverse.
      const cibles = focusables();
      if (cibles.length === 0) {
        e.preventDefault();
        return;
      }
      const premier = cibles[0];
      const dernier = cibles[cibles.length - 1];
      const actif = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (actif === premier || !panneauRef.current?.contains(actif))) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && actif === dernier) {
        e.preventDefault();
        premier.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    // Empeche le defilement de la page derriere la modale.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
    // Volontairement PAS `onFermer` ici (lu via onFermerRef) : l'effet ne doit tourner
    // qu'au montage/demontage, jamais a chaque frappe.
  }, [focusables]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
    >
      <div className="absolute inset-0 bg-black/30" onClick={onFermer} />
      <div
        ref={panneauRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-[720px] rounded-lg border border-line bg-surface shadow-xl focus:outline-none"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-medium text-ink">{titre}</h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
          >
            <X strokeWidth={1.5} className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
