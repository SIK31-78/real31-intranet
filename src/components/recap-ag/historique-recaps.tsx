"use client";

// Historique des recaps AG : ce qui a ete enregistre, avec le depassement
// facture le cas echeant. Chaque ligne ouvre le recap en LECTURE (la meme vue que
// celle du comptable, cloisonnee au portefeuille cote serveur) : sans ce lien, un
// gestionnaire ne pouvait plus jamais relire ce qu'il avait saisi.
// La bascule « effectué » a ete RETIREE (decision Sekou 2026-09-08) : une coche sur
// un recap qu'on vient soi-meme de saisir n'avait pas de sens, et la boucle de suivi
// qui compte (« traité ») vit chez la comptable, dans sa file « Récaps d'AG reçus ».

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { CheckCircle2, ChevronRight, Receipt, TriangleAlert } from "lucide-react";
import { filtrerParPortee, type PorteeRecaps } from "@/lib/domain/recap-ag/mes-recaps";

/** Au-dela, on replie : une liste cabinet peut faire plusieurs centaines de lignes. */
const CAP_AFFICHAGE = 50;

export interface RecapAffiche {
  /** Ce recap releve-t-il de l'utilisateur ? (calcule cote serveur, cf. domain/recap-ag/mes-recaps) */
  mien: boolean;
  id: string;
  coproCode: string;
  agDate: string;
  statut: "nouveau" | "a_facturer" | "termine" | "erreur";
  depassementHeures: number;
  depassementTtc: number;
  nbTravaux: number;
  factureId?: string;
  par?: string;
  /** Horodatage ISO de creation (affiche date + heure). */
  creeLe: string;
}

function jour(iso: string): string {
  const [a, m, j] = iso.slice(0, 10).split("-");
  return `${j}/${m}/${a}`;
}
/** Date + heure locale de creation. */
function quand(iso: string): string {
  const d = new Date(iso);
  const deuxChiffres = (n: number) => String(n).padStart(2, "0");
  return `${deuxChiffres(d.getDate())}/${deuxChiffres(d.getMonth() + 1)}/${d.getFullYear()} à ${deuxChiffres(d.getHours())}:${deuxChiffres(d.getMinutes())}`;
}

function euros(n: number): string {
  return `${n.toFixed(2).replace(".", ",")} €`;
}

function Statut({ statut }: { statut: RecapAffiche["statut"] }) {
  if (statut === "erreur") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-red-700">
        <TriangleAlert className="w-3.5 h-3.5" strokeWidth={1.5} /> Échec
      </span>
    );
  }
  if (statut === "a_facturer") {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-amber-800">
        <Receipt className="w-3.5 h-3.5" strokeWidth={1.5} /> Facturé
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-green-800">
      <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Terminé
    </span>
  );
}

function LigneRecap({ r }: { r: RecapAffiche }) {
  return (
    <li>
      <Link
        href={`/comptabilite/recaps/${r.id}`}
        className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
      >
        <div className="min-w-0">
          <p className="text-[13px] text-ink">
            <span className="font-medium">{r.coproCode}</span>
            <span className="text-ink-3"> · AG du {jour(r.agDate)}</span>
          </p>
          <p className="text-[12px] text-ink-3">
            Saisi le {quand(r.creeLe)}
            {r.par ? ` · ${r.par}` : ""}
            {r.nbTravaux > 0 ? ` · ${r.nbTravaux} travaux votés` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {r.depassementHeures > 0 ? (
            <span className="text-[13px] text-ink">
              {r.depassementHeures} h · {euros(r.depassementTtc)} TTC
            </span>
          ) : (
            <span className="text-[12px] text-ink-3">Pas de dépassement</span>
          )}
          <Statut statut={r.statut} />
          <ChevronRight strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-4" />
        </div>
      </Link>
    </li>
  );
}

export function HistoriqueRecaps({ recaps }: { recaps: RecapAffiche[] }) {
  // Defaut « moi » : l'ecran montrait les derniers recaps DU CABINET, donc chacun
  // cherchait les siens au milieu de ceux de 40 collegues.
  const [portee, setPortee] = useState<PorteeRecaps>("moi");
  const [deplie, setDeplie] = useState(false);

  const visibles = useMemo(() => filtrerParPortee(recaps, portee), [recaps, portee]);
  const affiches = deplie ? visibles : visibles.slice(0, CAP_AFFICHAGE);
  const reste = visibles.length - affiches.length;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Récaps enregistrés <span className="font-normal text-ink-3">({visibles.length})</span>
        </h2>
        <div className="inline-flex overflow-hidden rounded-md border border-line">
          {(["moi", "tous"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPortee(p);
                setDeplie(false);
              }}
              className={
                "h-7 px-3 text-[12px] font-medium transition-colors " +
                (portee === p
                  ? "bg-green-700 text-white"
                  : "bg-surface text-ink-2 hover:bg-surface-2")
              }
            >
              {p === "moi" ? "Mes récaps" : "Tous"}
            </button>
          ))}
        </div>
      </div>

      {visibles.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-3">
          {portee === "moi"
            ? "Aucun récap AG sur vos copropriétés. « Tous » affiche ceux du cabinet."
            : "Aucun récap AG pour l'instant."}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {affiches.map((r) => (
              <LigneRecap key={r.id} r={r} />
            ))}
          </ul>
          {reste > 0 && (
            <button
              type="button"
              onClick={() => setDeplie(true)}
              className="w-full border-t border-line px-4 py-2.5 text-left text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-green-700"
            >
              Afficher les {reste} de plus
            </button>
          )}
        </>
      )}
    </Card>
  );
}
