"use client";

import { Mail } from "lucide-react";
import type { MesEmails } from "@/lib/domain/mes-emails";

export function EnTete({
  data,
  nbNonLus,
  nbATraiter,
  nbClasses,
}: {
  data: MesEmails;
  nbNonLus: number;
  nbATraiter: number;
  nbClasses: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-11 h-11 rounded-full bg-info-50 text-info-700 text-body font-medium flex items-center justify-center shrink-0">
        {data.gestionnaire.initiales}
      </span>
      <div>
        <h1 className="text-page font-medium tracking-tight text-ink flex items-center gap-2">
          <Mail strokeWidth={1.5} className="w-5 h-5 text-ink-3" />
          Mes e-mails
        </h1>
        <p className="text-body text-ink-2 mt-0.5 tabular-nums">
          {nbNonLus} non lus · {nbATraiter} à traiter · {nbClasses} classés
        </p>
      </div>
    </div>
  );
}
