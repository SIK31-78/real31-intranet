"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Comptabilité" retourHref="/comptabilite" retourLibelle="Retour à la comptabilité" {...props} />;
}
