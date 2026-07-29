"use client";

// Systeme de toasts global (notifications ephemeres). Accessible : la zone est
// une live region (polite pour ok/info, le toast d'erreur passe en role=alert).
// API : const { ok, err, info } = useToast().

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Ton = "ok" | "err" | "info";
interface Toast {
  id: number;
  message: string;
  ton: Ton;
}
interface ToastApi {
  ok: (message: string) => void;
  err: (message: string) => void;
  info: (message: string) => void;
}

/** Duree d'affichage des toasts NON bloquants (ok / info). Les erreurs, elles, restent
 *  jusqu'a fermeture explicite : cf. `ajouter`. */
const DUREE_SUCCES_MS = 5000;

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
    setToasts((liste) => liste.filter((t) => t.id !== id));
  }, []);

  const ajouter = useCallback(
    (ton: Ton, message: string) => {
      const id = ++compteur;
      setToasts((liste) => [...liste, { id, message, ton }]);
      // Une ERREUR ne s'efface pas toute seule (retour d'une collegue de Sekou,
      // 2026-07-29 : "c'est chiant que les messages d'erreur restent juste 5 secondes").
      // Nos messages d'erreur sont ACTIONNABLES et souvent longs ("Parametres d'AG non
      // renseignes pour la copropriete X - a completer sur la fiche avant de facturer le
      // depassement") : disparaitre avant d'avoir ete lus les rend inutiles, et
      // l'utilisateur ne peut meme pas les recopier pour demander de l'aide.
      // Un succes, lui, n'appelle aucune action -> il s'efface. La croix ferme les deux.
      if (ton !== "err") setTimeout(() => retirer(id), DUREE_SUCCES_MS);
    },
    [retirer],
  );

  const api = useMemo<ToastApi>(
    () => ({
      ok: (m) => ajouter("ok", m),
      err: (m) => ajouter("err", m),
      info: (m) => ajouter("info", m),
    }),
    [ajouter],
  );

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-2rem)]"
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
  info: { cadre: "border-line bg-surface text-ink-2", icone: Info },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { cadre, icone: Icone } = STYLE[toast.ton];
  return (
    <div
      role={toast.ton === "err" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 shadow-sm text-[13px] ${cadre}`}
    >
      <Icone strokeWidth={1.5} className="w-4 h-4 mt-px shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="text-current/60 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
