import type { Metadata } from "next";
import Link from "next/link";
import { Printer, ListChecks, Info, Eye } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { decouperIdOdj } from "@/lib/services/odj/resoudre-cle-odj";
import { peutEcrireSurCopro } from "@/lib/services/coproprietes/copro-appartient";
import { coproEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { DocumentOdj } from "@/components/odj/document-odj";
import { DocumentOdjEditable } from "@/components/odj/document-odj-editable";
import { ClotureOdjBloc } from "@/components/odj/cloture-odj";
import { saisirChampAction, togglePointAction, cloturerOdjAction } from "./actions";

export const metadata: Metadata = { title: "ODJ - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'ODJ est un MODULE EDITABLE : le document s'edite sur place (cliquer une valeur,
// taper, auto-save), plus de double vue formulaire / apercu. Un ODJ clos redevient
// un document statique (le verrou serveur est dans actions.ts, ici c'est l'affichage).
//
// CONSULTATION PAR L'EQUIPE (Sekou, 2026-09-04, sur "je veux consulter le CR de CS
// prepare par Fanny, j'appuie sur ODJ -> 404"). L'ecran s'ouvre desormais a tout
// collaborateur, au perimetre de LECTURE (perimetre-lecture) ; le NON-gestionnaire de la
// copro voit exactement le meme rendu FIGE qu'un ODJ clos - une seule mise en page, pas
// une troisieme copie qui divergerait. Ce qui suit n'est que de l'affichage : le verrou
// d'ecriture est cote serveur (actions.ts / autorise), et il n'a pas bouge.

export default async function OdjPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const { code } = decouperIdOdj(id);
  // Deux lectures independantes -> en parallele : le document (perimetre de LECTURE) et
  // le droit d'y toucher (perimetre d'ECRITURE = le portefeuille, MEME regle que les
  // actions serveur, appelee depuis le meme module - elles ne peuvent pas diverger).
  const [odj, peutModifier] = await Promise.all([
    getOdj(id, g.id, { transverse: true }),
    peutEcrireSurCopro(code, g.id),
  ]);
  if (!odj) notFound();
  // Consultation : on nomme le gestionnaire de la copro pour que le lecteur sache chez qui
  // il regarde. Lecture faite UNIQUEMENT dans ce cas - zero cout sur le chemin nominal.
  const gestionnaire = peutModifier
    ? undefined
    : (await coproEnLecture(code))?.equipe.find((m) => m.role === "gestionnaire")?.nomComplet;
  // Fige = ODJ clos (comme avant) OU consultation par un collegue.
  const fige = Boolean(odj.cloture) || !peutModifier;

  const onSaisir = saisirChampAction.bind(null, id);
  const onToggle = togglePointAction.bind(null, id);
  const onCloturer = cloturerOdjAction.bind(null, id);
  // Id de supervision "CODE__YYYY-MM-DD" : meme convention que partout ailleurs. On le
  // reconstruit depuis la date ISO de l'ODJ (l'URL, elle, ne la porte pas toujours :
  // /odj/SE999 vise la prochaine AG sans la nommer). Sans AG datee, pas de cible.
  const supervisionId = odj.dateAgISO ? `${odj.copro.code}__${odj.dateAgISO}` : undefined;

  return (
    <AppShell user={g} active="aucun" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <div className="mx-auto max-w-[900px] px-4 py-6 sm:px-6 md:px-8 md:py-8 flex flex-col gap-5">
        <div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-[22px] font-medium tracking-tight">Ordre du jour - preparation AG</h1>
            <div className="flex items-center gap-2 shrink-0">
              {/* "Composer" est un ecran d'EDITION : on ne le propose pas a qui ne peut
                  pas ecrire (il refuserait, et un bouton qui refuse est une fausse piste). */}
              {peutModifier && (
                <Link
                  href={`/odj/${id}/composer`}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-green-700 text-surface text-[13px] font-medium hover:bg-green-600 transition-colors"
                >
                  <ListChecks strokeWidth={1.5} className="w-3.5 h-3.5" />
                  Composer l&apos;ODJ
                </Link>
              )}
              <Link
                href={`/odj/${id}/imprimer`}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-line bg-surface text-[13px] font-medium text-ink-2 hover:border-line-2 hover:text-ink transition-colors"
              >
                <Printer strokeWidth={1.5} className="w-3.5 h-3.5" />
                Version imprimable
              </Link>
            </div>
          </div>
          <p className="text-[13px] text-ink-3 mt-1">
            {odj.copro.nom} ({odj.copro.code}){odj.dateAg ? ` - AG du ${odj.dateAg}` : ""}
          </p>
          {peutModifier ? (
            <p className="text-[12px] text-ink-4 mt-2">
              Cliquez une valeur soulignée pour la modifier directement dans le document - la saisie
              s&apos;enregistre automatiquement (la vider rétablit la valeur automatique).
            </p>
          ) : (
            // Consultation par un collegue : on dit CHEZ QUI on est et qu'on ne peut rien
            // changer. Sans ce bandeau, un document figé sans explication passe pour un bug.
            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-line bg-surface-2 px-3.5 py-2.5">
              <Eye strokeWidth={1.5} className="w-4 h-4 text-ink-3 shrink-0 mt-px" />
              <p className="text-[12.5px] text-ink-3">
                {gestionnaire ? `ODJ de ${gestionnaire}` : "ODJ d'une copropriété d'un collègue"} -
                consultation seule.
                {odj.cloture ? " La réunion est terminée, le document est clôturé." : ""} Seul le
                gestionnaire de la copropriété peut le modifier.
              </p>
            </div>
          )}
          {/* Invitation a PREPARER : elle ne s'adresse qu'a qui peut ecrire. */}
          {!odj.dateAg && peutModifier && (
            // PAS un avertissement bloquant : la preparation n'attend pas la date
            // (retour collegue 2026-09-01). Le brouillon sans date est rattache a
            // l'AG des que sa date est fixee (reporterOdjSansDate).
            <div className="mt-3 flex items-start gap-2.5 rounded-md border border-info-500/30 bg-info-50 px-3.5 py-2.5">
              <Info strokeWidth={1.5} className="w-4 h-4 text-info-700 shrink-0 mt-px" />
              <p className="text-[12.5px] text-info-700">
                Pas encore de date d&apos;AG : vous pouvez préparer dès maintenant, tout sera
                automatiquement rattaché à l&apos;AG quand sa date sera fixée. Seules les échéances
                (mise sous pli, limite d&apos;ajout de points) restent à calculer -{" "}
                <Link href={`/copropriete/${odj.copro.code}`} className="font-medium underline">
                  fixer la date sur la fiche copro
                </Link>
                .
              </p>
            </div>
          )}
        </div>

        {/* Cloture "reunion terminee" : fige l'ODJ et ouvre la supervision AG. Place en
            TETE parce que c'est l'action de sortie de cet ecran - et parce qu'une fois
            clos, le bandeau explique pourquoi plus rien n'est modifiable en dessous.
            Cloturer / rouvrir sont des ECRITURES : le bloc ne s'affiche pas en
            consultation (le bandeau au-dessus dit deja ou en est le document). */}
        {peutModifier && (
          <ClotureOdjBloc
            id={id}
            {...(odj.cloture ? { cloture: odj.cloture } : {})}
            {...(supervisionId ? { supervisionId } : {})}
            onCloturer={onCloturer}
          />
        )}

        {fige ? (
          // Fige = document statique, sans aucune affordance d'edition : ODJ clos, ou
          // consultation par un collegue. Le MEME rendu pour les deux.
          <div className="rounded-lg border border-line bg-white shadow-sm px-8 py-8 sm:px-10 sm:py-9">
            <DocumentOdj odj={odj} />
          </div>
        ) : (
          <DocumentOdjEditable odj={odj} onSaisir={onSaisir} onTogglePoint={onToggle} />
        )}
      </div>
    </AppShell>
  );
}
