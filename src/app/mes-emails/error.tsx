"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Mes e-mails" retourHref="/mes-emails" retourLibelle="Retour à la boîte" {...props} />;
}
