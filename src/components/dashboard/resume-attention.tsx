import Link from "next/link";
import { ChevronRight, ArrowRight, CircleCheck } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JalonPill } from "@/components/ui/jalon-pill";
import { BoutonConfirmerJalon } from "@/components/dashboard/bouton-confirmer-jalon";
import type { ItemAttention } from "@/lib/domain/dashboard";

// Resume des priorites (pilotage) : top 3 urgences + renvoi vers l'accueil (bandeau AG
// + dossiers). Composant DORMANT depuis la bascule S3.B (retire du dashboard), conserve
// pour resservir ; ses liens pointent vers /accueil, plus vers l'ex-page Actions.

export function ResumeAttention({ items }: { items: ItemAttention[] }) {
  const top = items.slice(0, 3);
  return (
    <Card>
      <CardHeader>
        <CardTitle>À faire maintenant</CardTitle>
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
              const rowCls =
                "flex items-center gap-3 px-4 py-[11px] border-b border-line last:border-b-0 hover:bg-surface-2 transition-colors duration-75";
              const infoCls = "flex items-center gap-3 flex-1 min-w-0";
              const info = (
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
                </>
              );
              const peutConfirmer = item.aConfirmer && item.jalonCode && item.agDate;
              return (
                <div key={item.id} className={rowCls}>
                  {item.lien ? (
                    <Link href={item.lien} className={infoCls}>
                      {info}
                    </Link>
                  ) : (
                    <div className={infoCls}>{info}</div>
                  )}
                  {peutConfirmer ? (
                    <BoutonConfirmerJalon
                      coproCode={item.coproCode}
                      agDate={item.agDate!}
                      jalonCode={item.jalonCode!}
                    />
                  ) : (
                    <ChevronRight strokeWidth={1.5} className="w-3.5 h-3.5 text-ink-4 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
          <Link
            href="/accueil"
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
