// Bloc 1 de l'accueil dossiers : "AG - les plus urgentes" (la colonne vertebrale).
// Une ligne par copro dont l'AG presse : prochaine action + echeance + bouton vers
// l'ACTION precise (ODJ / supervision / fixer dates), jamais la fiche copro.
// Le calcul (action, lien, echeance) vient du domaine cycle-ag via le service
// get-ag-semaine : ce composant ne fait que presenter. Vide -> non rendu (bloc discret).

import Link from "next/link";
import { CalendarClock, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AgSemaineLigne } from "@/lib/services/affaires/get-ag-semaine";

// Ton du badge d'echeance, aligne sur la frise du dashboard : rouge = retard, J-x
// neutre, "a dater" en alerte.
function tonEcheance(ligne: AgSemaineLigne): "err" | "outline" | "warn" | "neutral" {
  if (ligne.enRetard) return "err";
  if (!ligne.echeance) return "neutral";
  if (ligne.echeance === "à confirmer") return "neutral";
  if (ligne.echeance.startsWith("J-")) return "outline";
  return "warn";
}

// On n'affiche que les N plus urgentes (deja triees par le service) pour ne pas
// noyer le gestionnaire ; le reste est accessible via "Toutes les AG". Retour patron.
const MAX_VISIBLE = 5;

export function AgSemaineBloc({ lignes }: { lignes: AgSemaineLigne[] }) {
  if (lignes.length === 0) return null; // rien d'imminent : bloc masque

  const visibles = lignes.slice(0, MAX_VISIBLE);
  const reste = lignes.length - visibles.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CalendarClock strokeWidth={1.5} className="w-4 h-4 text-ink-3" />
          AG - les plus urgentes
        </CardTitle>
        <span className="text-[12px] text-ink-3">
          {reste > 0 ? `${visibles.length} affichées sur ${lignes.length}` : `${lignes.length} échéance${lignes.length > 1 ? "s" : ""}`}
        </span>
      </CardHeader>
      <ul className="divide-y divide-line">
        {visibles.map((ligne) => (
          <li key={ligne.id}>
            <div className="flex items-center gap-2.5 px-4 py-3">
              <Link
                href={`/copropriete/${ligne.coproCode}`}
                className="font-mono text-[12px] text-ink-2 hover:text-green-700 shrink-0"
              >
                {ligne.coproCode}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-ink truncate">{ligne.coproNom}</div>
                <div className="text-[12px] text-ink-3 truncate">{ligne.prochaineAction}</div>
              </div>
              {ligne.echeance && (
                <Badge ton={tonEcheance(ligne)} dot={ligne.enRetard} className="font-mono shrink-0">
                  {ligne.echeance}
                </Badge>
              )}
              {ligne.actionSecondaire && (
                <Link
                  href={ligne.actionSecondaire.lien}
                  title="La préparation n'attend pas la date : l'ODJ sera rattaché à l'AG quand sa date sera fixée"
                  className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm border border-line bg-surface text-[12px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors shrink-0"
                >
                  {ligne.actionSecondaire.label}
                </Link>
              )}
              <Link
                href={ligne.lien}
                className="inline-flex items-center gap-1 h-7 px-2.5 rounded-sm bg-green-700 text-surface text-[12px] font-medium hover:bg-green-600 transition-colors shrink-0"
              >
                {ligne.actionLabel}
                <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {reste > 0 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
          <span className="text-[12px] text-ink-3">
            + {reste} autre{reste > 1 ? "s" : ""} échéance{reste > 1 ? "s" : ""} AG non affichée{reste > 1 ? "s" : ""}
          </span>
          <Link
            href="/copropriete"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-2 hover:text-green-700"
          >
            Toutes les AG
            <ArrowRight strokeWidth={1.5} className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </Card>
  );
}
