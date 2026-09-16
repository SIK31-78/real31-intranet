import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight, ClipboardCheck, Inbox } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estComptable } from "@/lib/auth/roles";
import { listerRecapsRecus, type RecapRecu } from "@/lib/services/compta/recaps-recus";
import { listerRecapsEnRetard } from "@/lib/services/compta/recaps-en-retard";
import { AppShell } from "@/components/layout/app-shell";
import { AlerteRecapsEnRetard } from "@/components/recap-ag/alerte-recaps-en-retard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateLongue, formatMois } from "@/lib/format-date";
import { Page, PageHeader } from "@/components/ui/page";

import { ancreDuJour } from "@/lib/services/date-du-jour";
export const metadata: Metadata = { title: "Récaps d'AG reçus - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Pas de garde de ROLE ici : le cloisonnement se fait sur le PERIMETRE (service). Un
// comptable voit les recaps de ses agences, un gestionnaire ceux de son portefeuille -
// c'est la meme page, chacun avec son cadrage. Marquer traite, en revanche, reste un
// geste du pole comptable (garde dans l'action).

/** "2026-06-11T09:00:00Z" -> "11 juin 2026" (on n'affiche pas l'heure dans la file). */
function jour(iso: string): string {
  return formatDateLongue(iso.slice(0, 10));
}

function LigneRecap({ r, comptable }: { r: RecapRecu; comptable: boolean }) {
  return (
    <li>
      <Link
        href={`/comptabilite/recaps/${r.id}`}
        className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-surface-2"
      >
        <span className="w-[44px] shrink-0 font-mono text-body text-ink-2">{r.coproCode}</span>
        <div className="min-w-0 flex-1 basis-[200px]">
          <p className="truncate text-body font-medium text-ink">{r.coproNom}</p>
          <p className="text-body text-ink-3">
            AG du {formatDateLongue(r.agDate)} · reçu le {jour(r.creeLe)}
            {r.par ? ` · ${r.par}` : ""}
          </p>
        </div>
        {r.nbTravaux > 0 && (
          <Badge ton="info">
            {r.nbTravaux} travaux {r.nbTravaux > 1 ? "votés" : "voté"}
          </Badge>
        )}
        {r.depassementHeures > 0 && (
          <Badge ton="neutral">Dépassement {r.depassementHeures} h</Badge>
        )}
        {r.traiteLe ? (
          <Badge ton="ok" dot>
            traité {r.traitePar ? `· ${r.traitePar}` : ""} {jour(r.traiteLe)}
          </Badge>
        ) : (
          <Badge ton="warn" dot>{comptable ? "à traiter" : "en attente compta"}</Badge>
        )}
        <ChevronRight strokeWidth={1.5} className="h-4 w-4 shrink-0 text-ink-3" />
      </Link>
    </li>
  );
}

/**
 * Regroupe par MOIS d'AG, le plus recent d'abord.
 *
 * POURQUOI : la reprise de l'historique PowerApps a verse 304 recaps d'un coup, tous
 * « a traiter » (la colonne de traitement n'existait pas avant). Une file de 300 lignes
 * a plat est inexploitable - et decider d'office lesquels sont « deja traites » serait
 * trancher a la place du pole comptable. On range donc l'AFFICHAGE sans toucher a une
 * seule donnee : le mois en cours est ouvert, les precedents se deplient a la demande.
 *
 * Le mois est un decoupage NATUREL (une AG appartient a sa saison), pas un seuil arbitraire
 * qu'il faudrait justifier et re-justifier quand le volume change.
 */
function parMois(lignes: RecapRecu[]): { mois: string; lignes: RecapRecu[] }[] {
  const groupes = new Map<string, RecapRecu[]>();
  for (const r of lignes) {
    const mois = r.agDate.slice(0, 7);
    const deja = groupes.get(mois);
    if (deja) deja.push(r);
    else groupes.set(mois, [r]);
  }
  return [...groupes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mois, lignes]) => ({ mois, lignes }));
}

/** Un mois de la file. `<details>` natif : le repli marche sans JavaScript client. */
function GroupeMois({
  mois,
  lignes,
  ouvert,
  comptable,
}: {
  mois: string;
  lignes: RecapRecu[];
  ouvert: boolean;
  comptable: boolean;
}) {
  return (
    <details open={ouvert} className="group">
      <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-body text-ink-2 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          strokeWidth={1.5}
          className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open:rotate-90"
        />
        <span className="font-medium capitalize">{formatMois(mois)}</span>
        <span className="text-body text-ink-3">
          {lignes.length} récap{lignes.length > 1 ? "s" : ""}
        </span>
      </summary>
      <ul className="divide-y divide-line border-t border-line">
        {lignes.map((r) => (
          <LigneRecap key={r.id} r={r} comptable={comptable} />
        ))}
      </ul>
    </details>
  );
}

function Section({
  titre,
  aide,
  icone,
  lignes,
  vide,
  comptable,
}: {
  titre: string;
  aide: string;
  icone: React.ReactNode;
  lignes: RecapRecu[];
  vide: string;
  comptable: boolean;
}) {
  const groupes = parMois(lignes);
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h2 className="flex items-center gap-2 text-title font-semibold text-ink">
          {icone}
          {titre}
          <span className="text-body font-normal text-ink-3">({lignes.length})</span>
        </h2>
        <p className="mt-0.5 text-body text-ink-3">{aide}</p>
      </div>
      <Card>
        {lignes.length === 0 ? (
          <p className="px-4 py-6 text-center text-body text-ink-3">{vide}</p>
        ) : (
          <div className="divide-y divide-line">
            {groupes.map((g, i) => (
              // Seul le mois le plus recent est ouvert : c'est le travail courant. Les
              // precedents sont a portee d'un clic, jamais masques.
              <GroupeMois
                key={g.mois}
                mois={g.mois}
                lignes={g.lignes}
                ouvert={i === 0}
                comptable={comptable}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default async function RecapsRecusPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  const comptable = estComptable(g.email, g.role);
  const perimetre = { managerId: g.id, email: g.email, estComptable: comptable };

  // Vraie data : aujourd'hui reel ; mock : ancre calee sur les donnees mockees, comme
  // partout ailleurs (cf. /comptabilite) - sinon le mock vieillit et tout passe en retard.
  const today = ancreDuJour();

  const [{ aTraiter, traites }, enRetard] = await Promise.all([
    listerRecapsRecus(perimetre),
    listerRecapsEnRetard(perimetre, today),
  ]);

  return (
    <AppShell user={g} active="recaps-recus" breadcrumb="Récaps d'AG reçus">
      <Page largeur="lecture">
        <PageHeader
          eyebrow={
            comptable ? (
              <Link href="/comptabilite" className="inline-flex items-center gap-1 hover:text-ink">
                <ArrowLeft strokeWidth={1.5} className="h-3 w-3" /> Comptabilité
              </Link>
            ) : undefined
          }
          titre="Récaps d'AG reçus"
          aide={
            <p>
              Le compte-rendu que le gestionnaire remplit après l&apos;assemblée : budget voté, fonds travaux,
              travaux à appeler, nouveau contrat. C&apos;est la note de travail à partir de laquelle la
              comptabilité saisit.
            </p>
          }
        />

        {/* Les recaps ABSENTS d'abord, et hors des deux sections : ce ne sont pas des
            recaps a lire, c'est un trou a combler par le gestionnaire. */}
        <AlerteRecapsEnRetard
          lignes={enRetard}
          variante={comptable ? "comptable" : "gestionnaire"}
        />

        <Section
          titre="À traiter"
          aide="Récaps reçus dont la saisie comptable reste à faire."
          icone={<Inbox strokeWidth={1.5} className="h-4 w-4 text-warn-700" />}
          lignes={aTraiter}
          vide="Aucun récap en attente."
          comptable={comptable}
        />

        <Section
          titre="Traités"
          aide="Saisie faite : gardés pour référence."
          icone={<ClipboardCheck strokeWidth={1.5} className="h-4 w-4 text-ok-700" />}
          lignes={traites}
          vide="Aucun récap traité pour l'instant."
          comptable={comptable}
        />
      </Page>
    </AppShell>
  );
}
