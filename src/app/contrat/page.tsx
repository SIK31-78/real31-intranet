import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  listerContratsAPreparer,
  type LigneContratAPreparer,
} from "@/lib/services/contrat/lister-contrats";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";

export const metadata: Metadata = { title: "Contrats de syndic - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Entree du module contrat de syndic. Remplace le `NewContractScreen` du canvas PowerApps
// MYTHEC, qui se contentait de faire choisir une copropriete - ici la liste dit ou en est
// chaque copro dans le cycle de vie du contrat (cf. domain/contrat/etat-contrat) :
//
//   a generer  ->  genere (attend l'AG)  ->  [AG]  ->  recap a faire  ->  acte par le recap
//
// POURQUOI la convocation et pas la fin de mandat (Sekou, 11/09/2026) : le contrat se genere
// pour etre INSERE dans la convocation d'AG, une fois le montant negocie avec le conseil
// syndical. Sur le portefeuille reel, la fin du mandat tombe en median 36 jours APRES l'AG :
// classer par fin de mandat, c'est classer par la date ou il est deja trop tard.
//
// C'est le RECAP AG qui acte le contrat (son patron, 14/09) : une copro n'est « faite » que
// quand le suivi des contrats porte un cycle ouvert apres l'AG. Elle retombe alors en
// « sans AG planifiee », en bas, jusqu'a l'AG suivante - elle ne disparait pas.

export default async function ContratsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const lignes = await listerContratsAPreparer(g.id, aujourdhuiISO);
  const enCours = lignes.filter((l) => l.etat !== "a-planifier");
  const sansAg = lignes.filter((l) => l.etat === "a-planifier");
  const bloquees = enCours.filter((l) => l.etat === "a-generer" && !l.baremeComplet);
  const anneesManquantes = [...new Set(bloquees.map((l) => l.anneeBareme))].sort();

  return (
    <AppShell user={g} active="contrat" breadcrumb="Contrats de syndic">
      <Page largeur="travail">
        <PageHeader
          titre="Contrats de syndic"
          eyebrow={`${enCours.length} en cours · ${sansAg.length} sans AG planifiée`}
        />

        {/* Le barème manquant est un blocage SILENCIEUX si on ne le dit pas ici : le
            gestionnaire ne le découvrirait qu'en cliquant, copropriété par copropriété.
            On ne compte que ce qui est À GÉNÉRER : un contrat déjà édité n'attend rien. */}
        {bloquees.length > 0 && (
          <Callout
            ton="warn"
            titre={`${bloquees.length} contrat${bloquees.length > 1 ? "s" : ""} à générer en attente du barème ${anneesManquantes.join(" et ")}`}
          >
            leur cycle démarre sur une année dont la grille tarifaire est incomplète.
            La compléter les débloque tous d&apos;un coup.
          </Callout>
        )}

        <Section id="contrats-en-cours" titre="En cours" compte={enCours.length}>
          {enCours.length === 0 ? (
            <EmptyState>Aucune AG planifiée n&apos;attend de contrat</EmptyState>
          ) : (
            <TableContrats lignes={enCours} avecEtat />
          )}
        </Section>

        <Section id="contrats-sans-ag" titre="Sans AG planifiée" compte={sansAg.length}>
          {sansAg.length === 0 ? (
            <EmptyState>Toutes les copropriétés ont une AG planifiée</EmptyState>
          ) : (
            <TableContrats lignes={sansAg} />
          )}
        </Section>
      </Page>
    </AppShell>
  );
}

function TableContrats({
  lignes,
  avecEtat = false,
}: {
  lignes: LigneContratAPreparer[];
  avecEtat?: boolean;
}) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Copro</Th>
          <Th>Nom</Th>
          <Th>AG</Th>
          <Th>Prochain cycle</Th>
          <Th numeric>Barème</Th>
          <Th numeric>{avecEtat ? "État" : "Mandat en cours"}</Th>
        </tr>
      </Thead>
      <Tbody>
        {lignes.map((l) => (
          <Tr key={l.coproCode} interactive>
            <Td code>
              <LienLigne href={`/contrat/${l.coproCode}`} className="font-mono">
                {l.coproCode}
              </LienLigne>
            </Td>
            <Td principal>{l.nom}</Td>
            <Td className="tabular-nums">
              {l.dateAgISO ? (
                formatJour(l.dateAgISO)
              ) : l.etat === "recap-a-faire" && l.derniereEdition?.dateAgISO ? (
                // Pas de prochaine AG, mais on sait laquelle s'est tenue : c'est celle
                // du contrat édité.
                <span title="AG tenue, d'après le contrat édité">
                  {formatJour(l.derniereEdition.dateAgISO)}
                </span>
              ) : (
                <span
                  className="text-ink-3"
                  title={
                    l.agDatePerimee
                      ? `Dernière AG connue le ${formatJour(l.agDatePerimee)}, jamais glissée en « dernière AG »`
                      : undefined
                  }
                >
                  à planifier
                </span>
              )}
            </Td>
            <Td secondaire className="tabular-nums">
              {formatJour(l.debutISO)} → {formatJour(l.finISO)}
            </Td>
            <Td numeric>
              {l.baremeComplet ? (
                <span className="text-ink-2 tabular-nums">{l.anneeBareme}</span>
              ) : (
                <Badge ton="warn">{l.anneeBareme} incomplet</Badge>
              )}
            </Td>
            <Td numeric>
              {avecEtat ? (
                <Etat ligne={l} />
              ) : (
                <span className="text-ink-2 tabular-nums">
                  jusqu&apos;au {formatJour(l.finMandatISO)}
                </span>
              )}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** L'etat, dit avec ce qu'il faut pour agir : la date qui compte et qui a fait quoi. */
function Etat({ ligne: l }: { ligne: LigneContratAPreparer }) {
  switch (l.etat) {
    case "genere":
      return (
        <Badge
          ton="ok"
          title={l.derniereEdition?.par ? `Édité par ${l.derniereEdition.par}` : undefined}
        >
          généré le {formatJour(l.derniereEdition!.creeLeISO)}
        </Badge>
      );
    case "recap-a-faire":
      return (
        <Badge
          ton="warn"
          dot
          title="Le contrat existe, l'AG s'est tenue, le récap AG n'a pas été fait"
        >
          récap AG à faire
        </Badge>
      );
    case "a-generer":
      // Le compte a rebours porte sur la MISE SOUS PLI : c'est la que le contrat doit
      // exister. Passee, elle est en retard.
      if (l.joursAvantConvocation === null) return <span className="text-ink-3">—</span>;
      if (l.joursAvantConvocation < 0) {
        return (
          <Badge ton="err" dot>
            mise sous pli passée de {-l.joursAvantConvocation} j
          </Badge>
        );
      }
      return (
        <span
          className="text-ink-2 tabular-nums"
          title={`Mise sous pli le ${formatJour(l.dateConvocationISO!)}`}
        >
          à générer · J-{l.joursAvantConvocation}
        </span>
      );
    case "a-planifier":
      return <span className="text-ink-3">—</span>;
  }
}
