import Link from "next/link";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import type { CompteurAction } from "@/lib/domain/dashboard";
import type { Severite } from "@/lib/domain/commun";

const SEV_DETAIL: Record<Severite, string> = {
  late: "text-err-700 font-medium",
  soon: "text-warn-700 font-medium",
  ok: "text-ink-3",
};

export function KpiCard({ compteur }: { compteur: CompteurAction }) {
  const { label, valeur, unite, detail, detailFort, severiteDetail, icone, lien } = compteur;
  const classes =
    "block bg-surface border border-line rounded-md p-4 transition-colors duration-75 hover:border-line-2";

  const contenu = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">{label}</div>
        <Icon name={icone} className="w-[15px] h-[15px] text-ink-3" />
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[34px] font-medium leading-none tracking-tight" style={{ letterSpacing: "-0.02em" }}>
          {valeur}
        </span>
        <span className="text-[13px] text-ink-2">{unite}</span>
      </div>
      <div className="mt-2 text-[12.5px] text-ink-3">
        {detail}
        {detailFort && (
          <>
            {" · "}
            <span className={cn(severiteDetail ? SEV_DETAIL[severiteDetail] : "text-ink-3")}>{detailFort}</span>
          </>
        )}
      </div>
    </>
  );

  return lien ? (
    <Link href={lien} className={classes}>
      {contenu}
    </Link>
  ) : (
    <div className={classes}>{contenu}</div>
  );
}
