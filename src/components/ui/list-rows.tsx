import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Liste dense quand un tableau n'a pas de sens (AG urgentes, echanges, historique
// court) : une ligne de 36 px minimum, slots fixes, la ligne entiere est cliquable
// quand `href` est donne. Rendu serveur.

export function Rows({ children, encadre = true }: { children: ReactNode; encadre?: boolean }) {
  return (
    <ul className={cn("divide-y divide-line", encadre && "border border-line rounded-lg bg-surface shadow-1")}>
      {children}
    </ul>
  );
}

export function Row({
  href,
  avant,
  principal,
  secondaire,
  droite,
  ton,
}: {
  href?: string;
  /** Slot de gauche : code copro, date, icone. */
  avant?: ReactNode;
  /** La donnee qu'on cherche des yeux (nom). */
  principal: ReactNode;
  /** Le secondaire, sur la meme ligne (action a faire, type...). */
  secondaire?: ReactNode;
  /** Slot de droite : badge, bouton. */
  droite?: ReactNode;
  ton?: "warn" | "err";
}) {
  const contenu = (
    <>
      {avant && <span className="shrink-0 font-mono text-ink-2">{avant}</span>}
      <span className="min-w-0 flex-1 flex items-baseline gap-2 flex-wrap">
        <span className="font-medium text-ink truncate">{principal}</span>
        {secondaire && <span className="text-ink-2 truncate">{secondaire}</span>}
      </span>
      {droite && <span className="flex items-center gap-2 shrink-0">{droite}</span>}
    </>
  );
  const classes = cn(
    "flex items-center gap-3 px-4 min-h-9 py-1.5 text-body",
    ton === "warn" && "bg-warn-50/40",
    ton === "err" && "bg-err-50/40",
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className={cn(classes, "hover:bg-surface-2/60 transition-colors duration-120 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-inset")}
        >
          {contenu}
        </Link>
      ) : (
        <div className={classes}>{contenu}</div>
      )}
    </li>
  );
}
