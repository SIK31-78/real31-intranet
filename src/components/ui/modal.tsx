"use client";

// Modale accessible du design system : dialog vrai (role="dialog", aria-modal),
// Escape ferme, clic sur le fond ferme, focus pose a l'ouverture et piege dans la
// fenetre (Tab cycle sans sortir). Contenu long -> corps scrollable. Trois tailles,
// un pied optionnel (ModalFooter) pour les boutons. Apparition 180 ms.

import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const FOCUSABLES =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const TAILLES = {
  sm: "max-w-[440px]",
  md: "max-w-[640px]",
  lg: "max-w-[860px]",
} as const;

export function Modal({
  titre,
  onFermer,
  size = "md",
  children,
}: {
  titre: string;
  onFermer: () => void;
  size?: keyof typeof TAILLES;
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
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-0 py-0 sm:px-4 sm:py-8"
      role="dialog"
      aria-modal="true"
      aria-label={titre}
    >
      <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onFermer} />
      <div
        ref={panneauRef}
        tabIndex={-1}
        className={cn(
          // Sous sm (telephone) : plein ecran, sans coins ; des sm : la carte centree.
          "relative my-auto w-full min-h-screen sm:min-h-0 rounded-none sm:rounded-xl border-0 sm:border border-line bg-surface shadow-2 focus:outline-none animate-scale-in",
          TAILLES[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line pl-4 pr-2 h-11">
          <h2 className="text-title font-semibold text-ink truncate">{titre}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onFermer} aria-label="Fermer">
            <X strokeWidth={1.5} />
          </Button>
        </div>
        <div className="sm:max-h-[calc(100vh-9rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Corps de modale avec padding standard. */
export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="p-4 text-body text-ink">{children}</div>;
}

/** Pied de modale : les boutons a droite (le `primary` en dernier). */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{children}</div>;
}
