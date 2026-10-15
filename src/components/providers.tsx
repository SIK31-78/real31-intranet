"use client";

// Providers client montes une fois a la racine (toasts + confirmation).

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/confirm";
import { BandeauNouvelleVersion } from "@/components/version/bandeau-nouvelle-version";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        {children}
        <BandeauNouvelleVersion />
      </ConfirmProvider>
    </ToastProvider>
  );
}
