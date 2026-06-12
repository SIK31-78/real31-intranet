"use client";

import { Printer } from "lucide-react";

export function BoutonImprimer() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-white text-[13px] font-medium hover:bg-green-600 transition-colors print:hidden"
    >
      <Printer strokeWidth={1.5} className="w-3.5 h-3.5" />
      Imprimer / PDF
    </button>
  );
}
