"use client";

// Dialogue de confirmation accessible, en API imperative facon window.confirm :
//   const confirmer = useConfirm();
//   if (!(await confirmer({ titre, message, danger }))) return;
// Remplace les window.confirm natifs par une modale stylee du design system.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  titre: string;
  message?: string;
  confirmer?: string;
  annuler?: string;
  /** Action destructive : bouton rouge. */
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error("useConfirm doit etre utilise dans <ConfirmProvider>.");
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);

  const confirmer = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setOptions(opts);
      }),
    [],
  );

  const repondre = useCallback((valeur: boolean) => {
    resolveRef.current?.(valeur);
    resolveRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirmer}>
      {children}
      {options && <ConfirmDialog options={options} onRepondre={repondre} />}
    </ConfirmCtx.Provider>
  );
}

function ConfirmDialog({ options, onRepondre }: { options: ConfirmOptions; onRepondre: (v: boolean) => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onRepondre(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onRepondre]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={options.titre}
    >
      <div className="absolute inset-0 bg-black/30" onClick={() => onRepondre(false)} />
      <div className="relative w-full max-w-[400px] rounded-lg border border-line bg-surface shadow-xl p-5">
        <h2 className="text-[15px] font-medium text-ink">{options.titre}</h2>
        {options.message && <p className="text-[13px] text-ink-3 mt-1.5">{options.message}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => onRepondre(false)}
            className="h-9 px-3 rounded-md text-[13px] text-ink-2 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
          >
            {options.annuler ?? "Annuler"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onRepondre(true)}
            className={`h-9 px-4 rounded-md text-[13px] font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
              options.danger
                ? "bg-err-500 hover:bg-err-700 focus-visible:ring-err-500"
                : "bg-green-700 hover:bg-green-800 focus-visible:ring-green-600"
            }`}
          >
            {options.confirmer ?? "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
