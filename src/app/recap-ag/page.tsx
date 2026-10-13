import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproprietes } from "@/lib/services/coproprietes/get-coproprietes";
import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";
import { retenirRecapsEnRetard } from "@/lib/services/compta/compteur-recaps-en-retard";
import { listerContratsGeneres } from "@/lib/services/contrat/contrats-generes";
import { getRecapAgRepository } from "@/lib/adapters/router";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { AlerteRecapsEnRetard } from "@/components/recap-ag/alerte-recaps-en-retard";
import { FormulaireRecapAg } from "@/components/recap-ag/formulaire-recap-ag";
import { HistoriqueRecaps, type RecapAffiche } from "@/components/recap-ag/historique-recaps";
import { modeEmissionFacture } from "@/lib/domain/facturation/mode-emission";
import { appartenanceRecaps, estMonRecap } from "@/lib/domain/recap-ag/mes-recaps";
import { dateRecapSuggeree } from "@/lib/domain/recap-ag/controle-date";

import { jourParis } from "@/lib/services/date-du-jour";
export const metadata: Metadata = { title: "Récap AG - REAL31 Intranet" };
export const dynamic = "force-dynamic";

/**
 * Combien de recaps on remonte du cabinet avant de filtrer sur « les miens ».
 *
 * 50 suffisait quand la liste montrait tout le cabinet a plat. Des lors qu'on filtre,
 * 50 lignes cabinet peuvent ne contenir que 2 recaps du gestionnaire - sa liste
 * paraitrait vide alors qu'elle ne l'est pas. On elargit la fenetre de lecture, et
 * c'est l'AFFICHAGE qui se plafonne (depliable), pas la donnee.
 */
const LIMITE_HISTORIQUE = 300;

export default async function RecapAgPage({
  searchParams,
}: {
  searchParams: Promise<{ copro?: string }>;
}) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const sp = await searchParams;
  // `?copro=S104` : pose par l'alerte des recaps en retard pour ouvrir la saisie sur la
  // bonne copro. Simple defaut d'UI, borne au portefeuille par le select lui-meme.
  const coproInitial =
    typeof sp.copro === "string" && /^[A-Za-z0-9_-]{1,20}$/.test(sp.copro) ? sp.copro : undefined;

  const today = jourParis();
  // Perimetre PORTEFEUILLE, meme cadrage que le select ci-dessous : on n'alerte que sur
  // ce que le gestionnaire peut corriger ICI (un comptable a sa propre vue, /comptabilite/recaps).
  const repoRecaps = getRecapAgRepository();
  const [copros, cabinet, enRetard, contratsGeneres] = await Promise.all([
    getCoproprietes(g.id),
    // Vue « Tous » : les derniers du cabinet.
    repoRecaps.listerRecapsRecents(LIMITE_HISTORIQUE),
    listerRecapsEnRetard({ managerId: g.id, email: g.email, estComptable: false }, today),
    // Le contrat genere pour l'AG, a proposer dans « Nouveau contrat de gestion ».
    listerContratsGeneres(g.id, today),
  ]);
  // La pastille de la barre laterale suit l'alerte de cette page, sans attendre sa memoire.
  retenirRecapsEnRetard(g.id, enRetard.length);
  const codes = copros.map((c) => c.code);
  const [miens, datesRecaps] = await Promise.all([
    // Vue « Les miens » : filtree AVANT la limite (REA-166). Au-dela de 300 lignes cabinet,
    // les recaps anciens d'un gestionnaire sortaient de la fenetre avant d'etre filtres.
    repoRecaps.listerRecapsRecents(LIMITE_HISTORIQUE, { coproCodes: codes, ...(g.initiales ? { par: g.initiales } : {}) }),
    // Les AG deja recapees, pour ne plus les suggerer (REA-166).
    repoRecaps.listerDatesAgParCopro(codes),
  ]);
  // Les deux lectures se recouvrent : un recap n'apparait qu'une fois, le plus recent d'abord.
  const historique = [...new Map([...cabinet, ...miens].map((r) => [r.id, r])).values()].sort((a, b) =>
    b.creeLe.localeCompare(a.creeLe),
  );

  // « Les miens » = mes copros OU ma saisie. Calcule ICI et non dans le composant :
  // un Set ne traverse pas la frontiere serveur -> client, et le portefeuille est
  // deja charge pour le select de saisie.
  const aMoi = appartenanceRecaps(
    copros.map((c) => c.code),
    g.initiales,
  );

  const recaps: RecapAffiche[] = historique.map((r) => ({
    mien: estMonRecap(r, aMoi),
    id: r.id,
    coproCode: r.coproCode,
    agDate: r.agDate,
    statut: r.statut,
    depassementHeures: r.depassementHeures,
    depassementTtc: r.depassementTtc,
    nbTravaux: r.nbTravaux,
    ...(r.factureId ? { factureId: r.factureId } : {}),
    ...(r.par ? { par: r.par } : {}),
    creeLe: r.creeLe,
  }));

  return (
    <AppShell user={g} active="recap-ag" breadcrumb="Récap AG">
      <Page largeur="lecture">
        <PageHeader
          titre="Récap d'assemblée générale"
          aide={
            <p>
              Le compte-rendu de l&apos;AG une fois tenue : décisions votées, travaux, nouveau contrat. La durée
              incluse au contrat et la plage horaire sont lues sur la fiche de la copropriété ; le dépassement
              horaire est calculé automatiquement et facturé s&apos;il y a lieu, au tarif de l&apos;exercice
              approuvé.
            </p>
          }
        />

        {/* En tete : c'est ici que le gestionnaire corrige, donc c'est ici qu'on l'avertit. */}
        <AlerteRecapsEnRetard lignes={enRetard} variante="gestionnaire" />

        <div id="saisie-recap" className="scroll-mt-4">
          <FormulaireRecapAg
            copros={copros
              .map((c) => {
                // Date suggeree du recap = l'AG qui vient d'avoir lieu : la prochaine AG si sa
                // date est deja passee (ou du jour), sinon la derniere AG tenue - SAUF si elle a
                // deja son recap, ou date de plus de 6 mois (REA-166 : la derniere AG de l'an
                // dernier, suggeree par defaut, a fait saisir des recaps 2026 en 2025). Le champ
                // reste alors vide : la date se tape, elle ne se corrige pas a moitie.
                const suggestion = dateRecapSuggeree({
                  ...(c.prochaineAg?.date ? { prochaineAgDate: c.prochaineAg.date } : {}),
                  ...(c.derniereAgDate ? { derniereAgDate: c.derniereAgDate } : {}),
                  datesRecaps: datesRecaps.get(c.code) ?? [],
                  aujourdhui: today,
                });
                const suggeree = suggestion?.date;
                // L'heure n'est connue que pour la prochaine AG planifiee (pas pour la derniere
                // tenue) : sans elle, le formulaire retombe sur 18:00.
                const heure = suggestion?.origine === "prochaine" ? c.prochaineAg?.heure : undefined;
                const contratGenere = contratsGeneres.get(c.code);
                return {
                  code: c.code,
                  nom: c.nom,
                  ...(suggeree ? { agDateSuggeree: suggeree } : {}),
                  ...(heure ? { agHeureSuggeree: heure } : {}),
                  ...(contratGenere ? { contratGenere } : {}),
                };
              })
              .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }))}
            pennylaneMode={modeEmissionFacture(process.env.PENNYLANE_API_KEY, process.env.PENNYLANE_FACTURE_VALIDEE)}
            {...(coproInitial ? { coproInitial } : {})}
          />
        </div>

        <HistoriqueRecaps recaps={recaps} />
      </Page>
    </AppShell>
  );
}
