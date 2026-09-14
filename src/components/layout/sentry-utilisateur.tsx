"use client";

// Attache le collaborateur connecte aux evenements Sentry du NAVIGATEUR (le serveur le fait
// dans AppShell). Id technique + initiales seulement.
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export function SentryUtilisateur({ id, initiales }: { id: string | null; initiales: string | null }) {
  useEffect(() => {
    Sentry.setUser(id ? { id, username: initiales ?? undefined } : null);
  }, [id, initiales]);
  return null;
}
