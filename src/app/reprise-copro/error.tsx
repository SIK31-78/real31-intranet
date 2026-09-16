"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Reprise de copropriété" retourHref="/reprise-copro/dossiers" retourLibelle="Retour aux dossiers" {...props} />;
}
