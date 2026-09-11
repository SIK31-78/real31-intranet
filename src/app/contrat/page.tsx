import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listerContratsAPreparer } from "@/lib/services/contrat/lister-contrats";
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

// Entree du module contrat de syndic : le portefeuille, trie par MISE SOUS PLI de la
// convocation. Remplace le `NewContractScreen` du canvas PowerApps MYTHEC, qui se contentait
// de faire choisir une copropriete - ici la liste dit aussi ce qui presse et ce qui bloque.
//
// POURQUOI la convocation et pas la fin de mandat (Sekou, 11/09/2026) : le contrat se genere
// pour etre INSERE dans la convocation d'AG, une fois le montant negocie avec le conseil
// syndical. Sur le portefeuille reel, la fin du mandat tombe en median 36 jours APRES l'AG :
// classer par fin de mandat, c'est classer par la date ou il est deja trop tard.

export default async function ContratsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO =
    process.env.COPRO_SOURCE === "supabase"
      ? new Date().toISOString().slice(0, 10)
      : "2026-05-27";
  const lignes = await listerContratsAPreparer(g.id, aujourdhuiISO);
  const bloquees = lignes.filter((l) => !l.baremeComplet);
  const aPlanifier = lignes.filter((l) => !l.dateAgISO).length;
  const anneesManquantes = [...new Set(bloquees.map((l) => l.anneeBareme))].sort();

  return (
    <AppShell user={g} active="contrat" breadcrumb="Contrats de syndic">
      <Page largeur="travail">
        <PageHeader
          titre="Contrats de syndic"
          eyebrow={`${lignes.length} copropriété${lignes.length > 1 ? "s" : ""} · ${aPlanifier} sans date d'AG`}
        />

        {/* Le barème manquant est un blocage SILENCIEUX si on ne le dit pas ici : le
            gestionnaire ne le découvrirait qu'en cliquant, copropriété par copropriété. */}
        {bloquees.length > 0 && (
          <Callout
            ton="warn"
            titre={`${bloquees.length} contrat${bloquees.length > 1 ? "s" : ""} en attente du barème ${anneesManquantes.join(" et ")}`}
          >
            leur cycle démarre sur une année dont la grille tarifaire est incomplète.
            La compléter les débloque tous d&apos;un coup.
          </Callout>
        )}

        <Section id="contrats-liste" titre="À préparer pour la convocation" compte={lignes.length}>
          {lignes.length === 0 ? (
            <EmptyState>Aucune copropriété avec une fin de mandat au référentiel</EmptyState>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Copro</Th>
                  <Th>Nom</Th>
                  <Th>AG</Th>
                  <Th>Prochain cycle</Th>
                  <Th numeric>Barème</Th>
                  <Th numeric>Mise sous pli</Th>
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
                      ) : (
                        <span className="text-ink-3">à planifier</span>
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
                    {/* Le compte a rebours porte sur la MISE SOUS PLI : c'est la que le
                        contrat doit exister. Passee, elle est en retard ; sans date d'AG,
                        il n'y a pas encore d'echeance a afficher. */}
                    <Td numeric>
                      {l.joursAvantConvocation === null ? (
                        <span className="text-ink-3">—</span>
                      ) : l.joursAvantConvocation < 0 ? (
                        <Badge ton="err" dot>
                          passée de {-l.joursAvantConvocation} j
                        </Badge>
                      ) : (
                        <span
                          className="text-ink-2 tabular-nums"
                          title={`Mise sous pli le ${formatJour(l.dateConvocationISO!)}`}
                        >
                          J-{l.joursAvantConvocation}
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Section>
      </Page>
    </AppShell>
  );
}
