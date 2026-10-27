"use client";

import { ErreurModule } from "@/components/layout/erreur-module";

export default function Error(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErreurModule module="Tri des e-mails" retourHref="/tri-emails" retourLibelle="Retour au tri" {...props} />;
}
