"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// Le primaire de la page imprimable : imprimer.
export function BoutonImprimer() {
  return (
    <Button variant="primary" onClick={() => window.print()} className="print:hidden">
      <Printer strokeWidth={1.5} />
      Imprimer / PDF
    </Button>
  );
}
