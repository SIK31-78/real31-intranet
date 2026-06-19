import Link from "next/link";
import { ChevronRight, ArrowRight, CircleCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JalonPill } from "@/components/ui/jalon-pill";
import type { ItemAttention } from "@/lib/domain/dashboard";

// Resume des priorites sur le dashboard (pilotage) : top 3 urgences + renvoi vers
// la worklist complete (Mes evenements). La liste filtrable exhaustive vit la-bas.

export function ResumeAttention({ items }: { items: ItemAttention[] }) {
  const top = items.slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Priorités du moment</CardTitle>
        <Link href="/mes-evenements" className="text-[12px] text-info-700 hover:underline">
          Voir tout
        </Link>
      </CardHeader>

      {top.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CircleCheck strokeWidth={1.5} className="w-5 h-5 text-ok-500 mx-auto mb-1.5" aria-hidden="true" />
          <p className="text-[13px] text-ink-3">Rien d&apos;urgent. Tout est à jour.</p>
        </div>
      ) : (
        <>
          <div>
            {top.map((item) => {
              const cls =
                "flex items-center gap-3 px-4 py-[11px] border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-75";
              const contenu = (
                <>
                  <JalonPill label={item.jalon.label} severite={item.jalon.severite} />
                  <span className="font-mono text-[12px] text-ink-2 w-[38px] shrink-0">{item.coproCode}</span>
                  <span className="flex-1 text-[13px] min-w-0 truncate">{item.titre}</span>
                  {item.badge ? (
                    <Badge ton={item.badge.ton} dot>
                      {item.badge.texte}
                    </Badge>
                  ) : item.echeance ? (
                    <span className="font-mono text-[12px] text-ink-3">{item.echeance}</span>
                  ) : null}
                  <ChevronRight strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                </>
              );
              return item.lien ? (
                <Link key={item.id} href={item.lien} className={cls}>
                  {contenu}
                </Link>
              ) : (
                <div key={item.id} className={cls}>
                  {contenu}
                </div>
              );
            })}
          </div>
          <Link
            href="/mes-evenements"
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] text-green-700 hover:bg-green-50 border-t border-line"
          >
            Voir toutes mes tâches à traiter
            <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
          </Link>
        </>
      )}
    </Card>
  );
}
