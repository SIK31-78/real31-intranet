"use client";

// Systeme de toasts global (notifications ephemeres). Accessible : la zone est
// une live region (polite pour ok/info/warn, le toast d'erreur passe en role=alert).
// API : const { ok, err, info, warn } = useToast().
// Un succes peut porter un lien (ex. « Ouvrir le brouillon dans Outlook », REA-408) : il
// s'ouvre dans un nouvel onglet et le toast reste alors plus longtemps.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type Ton = "ok" | "err" | "info" | "warn";
/** Lien porte par un toast, ouvert dans un nouvel onglet. */
export interface LienToast {
  href: string;
  libelle: string;
}
interface Toast {
  id: number;
  message: string;
  ton: Ton;
  lien?: LienToast;
  /** En cours de sortie (animation) : retire du DOM 180 ms plus tard. */
  sortie?: boolean;
}
interface ToastApi {
  ok: (message: string, lien?: LienToast) => void;
  err: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
}

/** Duree d'affichage des toasts NON bloquants (ok / info / warn). Les erreurs, elles,
 *  restent jusqu'a fermeture explicite : cf. `ajouter`. */
const DUREE_SUCCES_MS = 5000;
/** Un toast qui porte un lien : le temps de le lire et de cliquer. */
const DUREE_AVEC_LIEN_MS = 12000;
const DUREE_SORTIE_MS = 180;

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast doit etre utilise dans <ToastProvider>.");
  return ctx;
}

let compteur = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const retirer = useCallback((id: number) => {
    // Deux temps : on marque la sortie (animation), puis on retire du DOM.
    setToasts((liste) => liste.map((t) => (t.id === id ? { ...t, sortie: true } : t)));
    setTimeout(() => setToasts((liste) => liste.filter((t) => t.id !== id)), DUREE_SORTIE_MS);
  }, []);

  const ajouter = useCallback(
    (ton: Ton, message: string, lien?: LienToast) => {
      const id = ++compteur;
      setToasts((liste) => [...liste, { id, message, ton, ...(lien ? { lien } : {}) }]);
      // Une ERREUR ne s'efface pas toute seule (retour d'une collegue de Sekou,
      // 2026-07-29 : "c'est chiant que les messages d'erreur restent juste 5 secondes").
      // Nos messages d'erreur sont ACTIONNABLES et souvent longs ("Parametres d'AG non
      // renseignes pour la copropriete X - a completer sur la fiche avant de facturer le
      // depassement") : disparaitre avant d'avoir ete lus les rend inutiles, et
      // l'utilisateur ne peut meme pas les recopier pour demander de l'aide.
      // Un succes, lui, n'appelle aucune action -> il s'efface. La croix ferme les deux.
      if (ton !== "err") setTimeout(() => retirer(id), lien ? DUREE_AVEC_LIEN_MS : DUREE_SUCCES_MS);
    },
    [retirer],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (m, lien) => ajouter("ok", m, lien),
      err: (m) => ajouter("err", m),
      info: (m) => ajouter("info", m),
      warn: (m) => ajouter("warn", m),
    }),
    [ajouter],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {/* Au-dessus des fenetres (modal et confirm en z-[70]) : en z-[60], une erreur ou la
          confirmation d'envoi restait cachee derriere « Envoyer un e-mail » ouverte
          (REA-349, 16/10/2026). Une notification doit se voir quelle que soit la fenetre. */}
      <div
        className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => retirer(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

const STYLE: Record<Ton, { cadre: string; icone: typeof Info }> = {
  ok: { cadre: "border-ok-500/30 bg-ok-50 text-ok-700", icone: CheckCircle2 },
  err: { cadre: "border-err-500/30 bg-err-50 text-err-700", icone: AlertCircle },
  warn: { cadre: "border-warn-500/30 bg-warn-50 text-warn-700", icone: AlertTriangle },
  info: { cadre: "border-line bg-surface text-ink", icone: Info },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { cadre, icone: Icone } = STYLE[toast.ton];
  return (
    <div
      role={toast.ton === "err" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-2 text-body",
        cadre,
        toast.sortie ? "animate-fade-out" : "animate-slide-up",
      )}
    >
      <Icone strokeWidth={1.5} className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <span className="flex-1">
        {toast.message}
        {toast.lien ? (
          <>
            {" "}
            <a href={toast.lien.href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
              {toast.lien.libelle}
            </a>
          </>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="text-current/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
