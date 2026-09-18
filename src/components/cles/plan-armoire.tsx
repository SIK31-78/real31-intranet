import Link from "next/link";
import { cn } from "@/lib/cn";
import { ARMOIRE, type Bac } from "@/lib/domain/cles/armoire";

// Le plan de l'armoire a cles : 6 colonnes de 20 bacs, dessines comme on les voit.
// Chaque bac porte sa couleur (vide, tout en agence, reserve, sorti, retard) et mene a la
// liste de ce qu'il contient. `surligne` marque le bac qu'on cherche (fiche trousseau).
// Rendu serveur, zero JS : c'est une grille de liens.

const TONS: Record<Bac["ton"], string> = {
  vide: "bg-surface-2 border-line text-ink-3",
  ok: "bg-ok-50 border-ok-500/30 text-ok-700",
  info: "bg-info-50 border-info-500/30 text-info-700",
  warn: "bg-warn-50 border-warn-500/40 text-warn-700",
  err: "bg-err-50 border-err-500/40 text-err-700",
};

export function PlanArmoire({
  bacs,
  surligne,
  taille = "normale",
  hrefBac = (code) => `/cles?tiroir=${code}`,
}: {
  bacs: Bac[];
  /** Code du bac a mettre en avant (ex. le tiroir du trousseau affiche). */
  surligne?: string;
  taille?: "normale" | "mini";
  hrefBac?: (code: string) => string;
}) {
  const mini = taille === "mini";
  const colonnes = Array.from({ length: ARMOIRE.colonnes }, (_, c) => bacs.filter((b) => b.colonne === c + 1));
  return (
    <div className={cn("grid gap-1.5", mini ? "grid-cols-6" : "grid-cols-3 sm:grid-cols-6")} role="list" aria-label="Plan de l'armoire à clés">
      {colonnes.map((col, i) => (
        <div key={i} className="flex flex-col gap-0.5" role="listitem" aria-label={`Colonne ${i + 1}`}>
          {!mini && <span className="text-meta text-ink-3 text-center tabular-nums mb-0.5">col. {i + 1}</span>}
          {col.map((b) => {
            const actif = surligne === b.code;
            const titre = b.trousseaux.length === 0 ? `${b.code} · vide` : `${b.code} · ${b.trousseaux.map((t) => t.numero).join(", ")}`;
            const classes = cn(
              "flex items-center justify-between rounded-sm border tabular-nums transition-colors duration-120",
              mini ? "h-2.5 px-0.5" : "h-6 px-1.5 text-meta",
              TONS[b.ton],
              actif && "ring-2 ring-green-700 ring-offset-1 font-semibold",
              !mini && b.trousseaux.length > 0 && "hover:border-line-2",
            );
            if (mini) return <span key={b.code} title={titre} className={classes} aria-label={titre} />;
            return (
              <Link key={b.code} href={hrefBac(b.code)} title={titre} className={cn(classes, "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600")}>
                <span>{b.code.replace(/^T0*/, "T")}</span>
                {b.trousseaux.length > 0 && <span className="font-medium">{b.trousseaux.length === 1 ? b.trousseaux[0].numero : b.trousseaux.length}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function LegendeArmoire() {
  const items: Array<[Bac["ton"], string]> = [["ok", "en agence"], ["info", "réservé"], ["warn", "sorti"], ["err", "en retard ou introuvable"], ["vide", "vide"]];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-2">
      {items.map(([ton, l]) => (
        <li key={ton} className="flex items-center gap-1.5">
          <span className={cn("inline-block w-3 h-3 rounded-sm border", TONS[ton])} aria-hidden /> {l}
        </li>
      ))}
    </ul>
  );
}
