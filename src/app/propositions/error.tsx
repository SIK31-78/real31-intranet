"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Propositions de contrat" retourHref="/propositions" retourLibelle="Retour au pipeline" {...props} />;
}
