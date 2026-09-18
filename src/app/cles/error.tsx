"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Gestion des clés" retourHref="/cles" retourLibelle="Retour au comptoir" {...props} />;
}
