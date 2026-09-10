import type { Metadata } from "next";
import { Printer, ListChecks, ArrowRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { getOdj } from "@/lib/services/odj/get-odj";
import { decouperIdOdj } from "@/lib/services/odj/resoudre-cle-odj";
import { peutEcrireSurCopro } from "@/lib/services/coproprietes/copro-appartient";
import { coproEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DocumentOdj } from "@/components/odj/document-odj";
import { DocumentOdjEditable } from "@/components/odj/document-odj-editable";
import { ClotureOdjBloc } from "@/components/odj/cloture-odj";
import { actionPrincipaleEcran } from "@/components/parcours/action-principale";
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
//
// UNE action principale (refonte 2026-09, actionPrincipaleEcran "odj") : document ouvert
// -> la cloture, qui vit dans ClotureOdjBloc avec sa case a cocher ; document clos ->
// "Passer a la supervision AG" en en-tete. Composer et Version imprimable sont
// secondaires, et n'apparaissent qu'une fois.

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

  // Le primaire de l'ecran. Le cycle n'est pas charge ici (l'ODJ n'en a pas besoin) :
  // pour cet ecran, le helper ne depend que de l'etat du document.
  const principale = peutModifier
    ? actionPrincipaleEcran(null, "odj", { coproCode: odj.copro.code, odjClos: Boolean(odj.cloture), ...(supervisionId ? { supervisionId } : {}) })
    : null;

  return (
    <AppShell user={g} active="aucun" breadcrumb={`ODJ - ${odj.copro.nom}`}>
      <Page largeur="lecture">
        <PageHeader
          titre="Ordre du jour — préparation AG"
          code={odj.copro.code}
          meta={`${odj.copro.nom}${odj.dateAg ? ` · AG du ${odj.dateAg}` : " · AG non datée"}`}
          actions={
            <>
              <ButtonLink href={`/odj/${id}/imprimer`} variant="secondary">
                <Printer strokeWidth={1.5} />
                Version imprimable
              </ButtonLink>
              {/* "Composer" est un ecran d'EDITION : on ne le propose pas a qui ne peut
                  pas ecrire (il refuserait, et un bouton qui refuse est une fausse piste). */}
              {peutModifier && (
                <ButtonLink href={`/odj/${id}/composer`} variant="secondary">
                  <ListChecks strokeWidth={1.5} />
                  Composer l&apos;ODJ
                </ButtonLink>
              )}
              {principale?.href && (
                <ButtonLink href={principale.href} variant="primary">
                  {principale.label}
                  <ArrowRight strokeWidth={1.5} />
                </ButtonLink>
              )}
            </>
          }
          aide={
            peutModifier && !odj.cloture ? (
              <p>
                Cliquez une valeur soulignée pour la modifier directement dans le document : la saisie
                s&apos;enregistre automatiquement, la vider rétablit la valeur automatique. Ctrl+Z annule.
              </p>
            ) : undefined
          }
        />

        {/* Consultation par un collegue : on dit CHEZ QUI on est et qu'on ne peut rien
            changer. Sans ce bandeau, un document fige sans explication passe pour un bug. */}
        {!peutModifier && (
          <Callout ton="neutral" titre="Consultation seule">
            {gestionnaire ? `ODJ de ${gestionnaire}` : "ODJ d'une copropriété d'un collègue"}
            {odj.cloture ? ", réunion terminée" : ""} — seul le gestionnaire de la copropriété peut le modifier.
          </Callout>
        )}

        {/* Invitation a PREPARER sans date : PAS un avertissement bloquant, la preparation
            n'attend pas la date (retour collegue 2026-09-01). Le brouillon sans date est
            rattache a l'AG des que sa date est fixee (reporterOdjSansDate). */}
        {!odj.dateAg && peutModifier && (
          <Callout
            ton="info"
            titre="Pas encore de date d'AG"
            actions={
              <ButtonLink href={`/copropriete/${odj.copro.code}`} variant="secondary" size="sm">
                Fixer la date
              </ButtonLink>
            }
          >
            préparez dès maintenant, tout sera rattaché à l&apos;AG quand sa date sera fixée ; seules les
            échéances (mise sous pli, limite d&apos;ajout de points) restent à calculer.
          </Callout>
        )}

        {/* Cloture "reunion terminee" : fige l'ODJ et ouvre la supervision AG. En TETE
            parce que c'est l'action de sortie de cet ecran (le primaire, avec sa case a
            cocher) - et parce qu'une fois clos, le bandeau explique pourquoi plus rien
            n'est modifiable en dessous. Cloturer / rouvrir sont des ECRITURES : le bloc
            ne s'affiche pas en consultation. */}
        {peutModifier && (
          <ClotureOdjBloc
            {...(odj.cloture ? { cloture: odj.cloture } : {})}
            onCloturer={onCloturer}
          />
        )}

        {fige ? (
          // Fige = document statique, sans aucune affordance d'edition : ODJ clos, ou
          // consultation par un collegue. Le MEME rendu pour les deux.
          <div className="rounded-md border border-line bg-white px-8 py-8 sm:px-10 sm:py-9">
            <DocumentOdj odj={odj} />
          </div>
        ) : (
          <DocumentOdjEditable odj={odj} onSaisir={onSaisir} onTogglePoint={onToggle} />
        )}
      </Page>
    </AppShell>
  );
}
