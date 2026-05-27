import { cn } from "@/lib/cn";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { ItemActivite, Ton } from "@/lib/domain/dashboard";

const TON_ICONE: Record<Ton, string> = {
  ok: "text-ok-500",
  info: "text-info-500",
  warn: "text-warn-500",
  err: "text-err-500",
  neutral: "text-ink-3",
};

export function FluxActivite({ activite }: { activite: ItemActivite[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activité récente</CardTitle>
      </CardHeader>
      <div className="px-4">
        {activite.map((item) => (
          <div key={item.id} className="flex gap-3 py-2.5 border-b border-line last:border-b-0">
            <Icon
              name={item.icone}
              className={cn("w-[15px] h-[15px] mt-0.5 shrink-0", TON_ICONE[item.tonIcone ?? "neutral"])}
            />
            <div className="text-[13px] leading-snug">
              <div>
                {item.texte}
                {item.coproCode && <span className="font-mono text-[12px] text-ink-3"> {item.coproCode}</span>}
              </div>
              <div className="text-[12px] text-ink-3">{item.quand}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
