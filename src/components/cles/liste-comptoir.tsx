"use client";

// Les trousseaux d'une copro (ou d'un tiroir) AU COMPTOIR : chaque ligne porte le geste du
// cycle (Sortir / Enregistrer le retour) sans ouvrir la fiche. L'assistante tape « aigle 38 »,
// clique la copro, clique Sortir : trois gestes.

import Link from "next/link";
import { Rows } from "@/components/ui/list-rows";
import { cn } from "@/lib/cn";
import type { TrousseauResume } from "@/lib/services/cles/lecture";
import { ActionsTrousseau } from "./actions-trousseau";
import { PastilleEtat } from "./pastille-etat";
import { decrireTrousseau } from "./ligne-trousseau";

export function ListeComptoir({ resumes, aujourdhuiISO, peutOperer, direction }: { resumes: TrousseauResume[]; aujourdhuiISO: string; peutOperer: boolean; direction: boolean }) {
  return (
    <Rows>
      {resumes.map((r) => {
        const d = decrireTrousseau(r);
        const t = r.trousseau;
        return (
          <li key={t.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 min-h-10 py-2 text-body", r.etat === "en_retard" && "bg-err-50/40")}>
            <Link href={`/cles/trousseaux/${t.id}`} className="shrink-0 font-mono text-ink-2 hover:text-ink hover:underline underline-offset-2" title="Ouvrir la fiche">
              {t.numero}
            </Link>
            <Link href={`/cles/trousseaux/${t.id}`} className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap hover:underline underline-offset-2 decoration-line-2">
              <span className="font-medium text-ink truncate">{d.principal}</span>
              {d.secondaire && <span className="text-ink-2 truncate">{d.secondaire}</span>}
            </Link>
            <span className="flex items-center gap-2 shrink-0 ml-auto flex-wrap">
              <PastilleEtat etat={r.etat} detail={d.detail} />
              <ActionsTrousseau trousseau={t} etat={r.etat} pret={r.pret} reservations={r.reservations} aujourdhuiISO={aujourdhuiISO} peutOperer={peutOperer} direction={direction} compact />
            </span>
          </li>
        );
      })}
    </Rows>
  );
}
