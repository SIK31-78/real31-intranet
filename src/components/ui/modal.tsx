"use client";

// Modale accessible du design system : dialog vrai (role="dialog", aria-modal),
// Escape ferme, clic sur le fond ferme, focus pose a l'ouverture et piege dans la
// fenetre (Tab cycle sans sortir). Contenu long -> corps scrollable. Trois tailles,
// un pied optionnel (ModalFooter) pour les boutons. Apparition 180 ms.
//
// Option `deplacable` (REA-138, fenetre de signalement) : la fenetre se deplace en tirant
// sa barre de titre (souris, doigt, stylet), reste contenue dans l'ecran, et le fond n'est
// plus assombri pour voir la page derriere. Le fond reste une couche TRANSPARENTE qui
// bloque les clics : la fenetre reste modale (aria-modal, focus piege, Echap ferme), et un
// clic a cote ne la ferme plus (on ne perd pas un texte en cours en visant la page).
// Sans l'option, le comportement est strictement celui d'avant.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { GripHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

const FOCUSABLES =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const TAILLES = {
  sm: "max-w-[440px]",
  md: "max-w-[640px]",
  lg: "max-w-[860px]",
} as const;

/** Borne le deplacement `delta` d'un rectangle (bord `debut`, longueur `taille`) pour qu'il
 *  reste dans [0, max]. Plus grand que l'ecran : il continue de le couvrir, sans laisser de
 *  vide. Pur, sur un seul axe. */
export function borner(debut: number, taille: number, delta: number, max: number): number {
  const mini = Math.min(0, max - taille) - debut;
  const maxi = Math.max(0, max - taille) - debut;
  return Math.min(Math.max(delta, mini), maxi);
}

export function Modal({
  titre,
  onFermer,
  size = "md",
  deplacable = false,
  children,
}: {
  titre: string;
  onFermer: () => void;
  size?: keyof typeof TAILLES;
  /** Fenetre deplacable par sa barre de titre, sans fond assombri (cf. en-tete). */
  deplacable?: boolean;
  children: ReactNode;
}) {
  const panneauRef = useRef<HTMLDivElement>(null);
  const deplacement = useDeplacement(panneauRef, deplacable);
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
      {deplacable ? (
        // Fond transparent : la page reste visible, mais les clics ne passent pas.
        <div className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-black/30 animate-fade-in" onClick={onFermer} />
      )}
      <div
        ref={panneauRef}
        tabIndex={-1}
        // `translate` (et non `transform`) : l'animation d'apparition fige `transform`.
        style={deplacable ? { translate: `${deplacement.x}px ${deplacement.y}px` } : undefined}
        className={cn(
          // Sous sm (telephone) : plein ecran, sans coins ; des sm : la carte centree.
          "relative my-auto w-full min-h-screen sm:min-h-0 rounded-none sm:rounded-xl border-0 sm:border border-line bg-surface shadow-2 focus:outline-none animate-scale-in",
          TAILLES[size],
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 border-b border-line pl-4 pr-2 h-11",
            // touch-none : sans lui, le navigateur garde le geste du doigt pour defiler.
            deplacable && "cursor-move touch-none select-none",
          )}
          {...(deplacable
            ? {
                onPointerDown: deplacement.onPointerDown,
                title: "Faire glisser pour déplacer la fenêtre",
              }
            : {})}
        >
          {deplacable && <GripHorizontal aria-hidden strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-3" />}
          <h2 className={cn("text-title font-semibold text-ink truncate", deplacable && "flex-1")}>{titre}</h2>
          <Button variant="ghost" size="sm" iconOnly onClick={onFermer} aria-label="Fermer">
            <X strokeWidth={1.5} />
          </Button>
        </div>
        <div className="sm:max-h-[calc(100vh-9rem)] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/** Deplacement de la fenetre par sa barre de titre (pointer events : souris + tactile +
 *  stylet). Le decalage est borne a l'ecran a chaque mouvement et au redimensionnement. */
function useDeplacement(panneauRef: RefObject<HTMLDivElement | null>, actif: boolean) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // Copie lisible hors rendu (gestionnaires d'evenements), tenue a jour a chaque ecriture.
  const posRef = useRef(pos);
  const placer = useCallback((p: { x: number; y: number }) => {
    posRef.current = p;
    setPos(p);
  }, []);

  // Fenetre redimensionnee : on ramene la fenetre dans l'ecran si elle en sort.
  useEffect(() => {
    if (!actif) return;
    function onResize() {
      const el = panneauRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = borner(r.left, r.width, 0, window.innerWidth);
      const dy = borner(r.top, r.height, 0, window.innerHeight);
      if (dx !== 0 || dy !== 0) placer({ x: posRef.current.x + dx, y: posRef.current.y + dy });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [actif, panneauRef, placer]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Bouton principal seulement, et jamais depuis un bouton de la barre (la croix).
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      // Telephone (sous sm) : la fenetre est plein ecran, il n'y a rien a decouvrir.
      if (!window.matchMedia("(min-width: 640px)").matches) return;
      const el = panneauRef.current;
      if (!el) return;
      e.preventDefault();
      const poignee = e.currentTarget;
      poignee.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const depart = { px: e.clientX, py: e.clientY, ...posRef.current };

      function onMove(ev: PointerEvent) {
        const dx = borner(r.left, r.width, ev.clientX - depart.px, window.innerWidth);
        const dy = borner(r.top, r.height, ev.clientY - depart.py, window.innerHeight);
        placer({ x: depart.x + dx, y: depart.y + dy });
      }
      function onFin(ev: PointerEvent) {
        if (poignee.hasPointerCapture(ev.pointerId)) poignee.releasePointerCapture(ev.pointerId);
        poignee.removeEventListener("pointermove", onMove);
        poignee.removeEventListener("pointerup", onFin);
        poignee.removeEventListener("pointercancel", onFin);
      }
      poignee.addEventListener("pointermove", onMove);
      poignee.addEventListener("pointerup", onFin);
      poignee.addEventListener("pointercancel", onFin);
    },
    [panneauRef, placer],
  );

  return { x: pos.x, y: pos.y, onPointerDown };
}

/** Corps de modale avec padding standard. */
export function ModalBody({ children }: { children: ReactNode }) {
  return <div className="p-4 text-body text-ink">{children}</div>;
}

/** Pied de modale : les boutons a droite (le `primary` en dernier). */
export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{children}</div>;
}
