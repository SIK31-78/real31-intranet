// Bloc « Contrats et contrôles à suivre » de l'accueil (REA-333, point 14 du plan) : les
// suivis rouges puis oranges des copros de la vue courante, et le nombre de suivis sans
// échéance. Même patron que les mandats sans AG : rien n'est affiché quand il n'y a rien à
// faire, pas de bloc vert.
//
// Le geste attendu est de DATER L'ÉTAPE franchie, sur l'onglet Contrats de la fiche de la
// copro : chaque ligne y mène. « Voir tout » ouvre la liste consolidée filtrée sur le niveau.

import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { Aide } from "@/components/ui/aide";
import { ButtonLink } from "@/components/ui/button";
import { formatDateLongue } from "@/lib/format-date";
import { LIBELLE_NIVEAU, LIBELLE_SUJET, REGLES_RELANCE_DEFAUT } from "@/lib/domain/contrats-copro/types";
import type { EcheancesAccueil, LigneSuivi } from "@/lib/services/contrats-copro/types";

/** Au-delà, la liste consolidée prend le relais (« Voir tout »). */
const MAX_LIGNES = 8;

function sujetDe(l: LigneSuivi): string {
  return l.sujet === "ctq_ascenseur" && l.ascenseurIdentifiant
    ? `${LIBELLE_SUJET[l.sujet]} ${l.ascenseurIdentifiant}`
    : LIBELLE_SUJET[l.sujet];
}

export function AlerteEcheancesContrats({ echeances }: { echeances: EcheancesAccueil }) {
  const { rouges, oranges, aCompleter } = echeances;
  if (rouges.length === 0 && oranges.length === 0 && aCompleter === 0) return null;

  const lignes = [...rouges, ...oranges];
  const visibles = lignes.slice(0, MAX_LIGNES);
  const tonTitre = rouges.length > 0 ? "text-err-700" : oranges.length > 0 ? "text-warn-700" : "text-ink";
  // Les seuils affichés sont ceux de départ ; la direction peut les ajuster dans /admin/relances.
  const { assurance, gaz, ctq_ascenseur: ctq } = REGLES_RELANCE_DEFAUT;

  return (
    <section aria-labelledby="echeances-contrats" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4 min-h-7">
        <h2
          id="echeances-contrats"
          className={`flex items-center gap-2 text-title font-semibold tracking-tight ${tonTitre}`}
        >
          <ShieldAlert strokeWidth={1.5} className="h-4 w-4 shrink-0" aria-hidden />
          Contrats et contrôles à suivre
          {lignes.length > 0 && <span className="text-body font-normal tabular-nums">{lignes.length}</span>}
        </h2>
        <Aide titre="Pourquoi cette alerte">
          Un suivi entre ici quand la fenêtre de renouvellement de son échéance est ouverte ({assurance.premierRappelJours} jours
          avant pour une assurance, {gaz.premierRappelJours} pour un contrat gaz, {ctq.premierRappelJours} pour un contrôle
          quinquennal) et qu&apos;aucune étape n&apos;a été franchie depuis trop longtemps : orange après {assurance.orangeJours} jours
          sans avancement, rouge après {assurance.rougeJours}. Dater l&apos;étape franchie sur l&apos;onglet Contrats de la fiche
          fait sortir le dossier d&apos;ici.
        </Aide>
      </div>

      {visibles.length > 0 && (
        <Rows>
          {visibles.map((l) => {
            const rouge = l.niveau === "rouge";
            return (
              <Row
                key={l.cycleId}
                href={`/copropriete/${encodeURIComponent(l.coproCode)}?onglet=contrats`}
                ton={rouge ? "err" : "warn"}
                avant={l.coproCode}
                principal={l.coproNom}
                secondaire={
                  <>
                    {sujetDe(l)}
                    {l.echeanceISO && <> · échéance le {formatDateLongue(l.echeanceISO)}</>}
                    {l.etapeCourante && (
                      <span className="text-ink-2">
                        {" "}· {l.franchies}/{l.total} {l.etapeCourante}
                      </span>
                    )}
                  </>
                }
                droite={
                  <Badge ton={rouge ? "err" : "warn"} dot>
                    {l.joursSansAvancement !== null ? `figé depuis ${l.joursSansAvancement} j` : LIBELLE_NIVEAU[l.niveau]}
                  </Badge>
                }
              />
            );
          })}
        </Rows>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-body text-ink-2">
        {aCompleter > 0 ? (
          <Link
            href="/contrats-copro?onglet=a-completer"
            className="underline underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600 rounded-sm"
          >
            {aCompleter} suivi{aCompleter > 1 ? "s" : ""} sans échéance à compléter
          </Link>
        ) : (
          <span />
        )}
        {lignes.length > 0 && (
          <ButtonLink href={`/contrats-copro?niveau=${rouges.length > 0 ? "rouge" : "orange"}`} variant="secondary" size="sm">
            {lignes.length > MAX_LIGNES ? `Voir les ${lignes.length}` : "Voir tout"}
            <ArrowRight strokeWidth={1.5} />
          </ButtonLink>
        )}
      </div>
    </section>
  );
}
