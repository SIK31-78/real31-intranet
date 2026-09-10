// Bloc 1 de l'accueil : "Vos assemblees generales" - la colonne vertebrale.
// Une ligne par copro dont l'AG presse : prochaine action + echeance + bouton vers
// l'ACTION precise (ODJ / supervision / fixer dates), jamais la fiche copro.
// Le calcul (action, lien, echeance) vient du domaine cycle-ag via le service
// get-ag-semaine : ce composant ne fait que presenter. Vide -> non rendu.
//
// Refonte UI : le PRIMAIRE de la page est dans l'en-tete (l'AG la plus urgente) ;
// ici chaque ligne porte son action en secondaire, 36 px, pas de carte, pas de mono
// sur les echeances.

import { ArrowRight } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge, type BadgeTon } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import type { AgSemaineLigne } from "@/lib/services/affaires/get-ag-semaine";

// Ton du badge d'echeance : rouge = retard, J-x neutre, "a dater" en alerte.
function tonEcheance(ligne: AgSemaineLigne): BadgeTon {
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
    <div className="flex flex-col gap-1.5">
      <Rows>
        {visibles.map((ligne) => (
          <Row
            key={ligne.id}
            avant={ligne.coproCode}
            principal={ligne.coproNom}
            secondaire={ligne.prochaineAction}
            ton={ligne.enRetard ? "err" : undefined}
            droite={
              <>
                {ligne.echeance && (
                  <Badge ton={tonEcheance(ligne)} dot={ligne.enRetard}>
                    {ligne.echeance}
                  </Badge>
                )}
                {ligne.actionSecondaire && (
                  <ButtonLink
                    href={ligne.actionSecondaire.lien}
                    variant="ghost"
                    size="sm"
                    title="La préparation n'attend pas la date : l'ODJ sera rattaché à l'AG quand sa date sera fixée"
                  >
                    {ligne.actionSecondaire.label}
                  </ButtonLink>
                )}
                <ButtonLink href={ligne.lien} variant="secondary" size="sm">
                  {ligne.actionLabel}
                  <ArrowRight strokeWidth={1.5} />
                </ButtonLink>
              </>
            }
          />
        ))}
      </Rows>
      {reste > 0 && (
        <p className="text-meta text-ink-2 px-1">
          + {reste} autre{reste > 1 ? "s" : ""} échéance{reste > 1 ? "s" : ""} AG non affichée{reste > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
