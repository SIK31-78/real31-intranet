"use client";

// Historique des recaps AG : ce qui a ete enregistre, avec le depassement
// facture le cas echeant. Chaque ligne ouvre le recap en LECTURE (la meme vue que
// celle du comptable, cloisonnee au portefeuille cote serveur) : sans ce lien, un
// gestionnaire ne pouvait plus jamais relire ce qu'il avait saisi.
//
// Chaque ligne porte aussi sa fermeture de boucle : « effectué » cote gestionnaire
// (etat persiste, cf. domain/recap-ag/suivi). Sans lui, la liste ne disait rien de
// ce qui restait a faire et il fallait la relire en entier a chaque passage.
//
// Le bouton est HORS du lien (et non dedans) : un <button> dans un <a> est invalide
// et rend le clic imprevisible - la ligne est donc un conteneur flex, le lien prend
// la place utile, le bouton reste a cote.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Receipt,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { estEffectue } from "@/lib/domain/recap-ag/suivi";
import { marquerRecapEffectueAction } from "@/app/recap-ag/actions";

export interface RecapAffiche {
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
  /** Horodatage ISO du marquage « effectué » ; absent = reste a faire. */
  effectueLe?: string;
  /** Initiales de celui qui a marque effectue. */
  effectuePar?: string;
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

/**
 * Bascule « effectué » d'une ligne. Discrete par defaut (le geste est ponctuel), et
 * l'erreur est AFFICHEE en plus du toast : tant que le SQL n'est pas passe, le serveur
 * repond un message actionnable qui nomme le fichier a executer.
 */
function BasculeEffectue({
  recapId,
  effectue,
  onErreur,
}: {
  recapId: string;
  effectue: boolean;
  onErreur: (message: string | null) => void;
}) {
  const router = useRouter();
  const { ok, err } = useToast();
  const [pending, demarrer] = useTransition();

  function basculer() {
    onErreur(null);
    demarrer(async () => {
      const r = await marquerRecapEffectueAction(recapId, !effectue);
      if (r.ok) {
        ok(effectue ? "Récap remis à faire." : "Récap marqué effectué.");
        router.refresh();
      } else {
        onErreur(r.erreur);
        err(r.erreur);
      }
    });
  }

  const Icone = pending ? Loader2 : effectue ? RotateCcw : Check;

  return (
    <button
      type="button"
      onClick={basculer}
      disabled={pending}
      title={effectue ? "Remettre ce récap à faire" : "Marquer ce récap comme effectué"}
      aria-label={effectue ? "Remettre ce récap à faire" : "Marquer ce récap comme effectué"}
      className={
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors disabled:opacity-60 " +
        (effectue
          ? "border-transparent bg-ok-50 text-ok-700 hover:bg-surface-2 hover:text-ink-2"
          : "border-line bg-surface text-ink-3 hover:border-transparent hover:bg-ok-50 hover:text-ok-700")
      }
    >
      <Icone strokeWidth={1.5} className={"h-3.5 w-3.5" + (pending ? " animate-spin" : "")} />
      {effectue ? "Effectué" : "À faire"}
    </button>
  );
}

function LigneRecap({ r }: { r: RecapAffiche }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const fait = estEffectue(r);

  return (
    <li className={fait ? "bg-ok-50" : undefined}>
      <div className="flex items-center gap-2 pr-3">
        <Link
          href={`/comptabilite/recaps/${r.id}`}
          className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2.5 transition-colors hover:bg-surface-2"
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
              {fait && r.effectueLe
                ? ` · effectué le ${jour(r.effectueLe)}${r.effectuePar ? ` par ${r.effectuePar}` : ""}`
                : ""}
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
        <BasculeEffectue recapId={r.id} effectue={fait} onErreur={setErreur} />
      </div>
      {erreur && (
        <p role="alert" className="px-4 pb-2.5 text-[12px] text-err-700">
          {erreur}
        </p>
      )}
    </li>
  );
}

export function HistoriqueRecaps({ recaps }: { recaps: RecapAffiche[] }) {
  return (
    <Card>
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Récaps enregistrés <span className="font-normal text-ink-3">({recaps.length})</span>
        </h2>
      </div>

      {recaps.length === 0 ? (
        <p className="px-4 py-8 text-center text-[13px] text-ink-3">
          Aucun récap AG pour l&apos;instant.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {recaps.map((r) => (
            <LigneRecap key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Card>
  );
}
