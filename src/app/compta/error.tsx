"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Pôle comptable" retourHref="/compta" retourLibelle="Retour au pôle comptable" {...props} />;
}
