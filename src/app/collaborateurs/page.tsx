import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirection, profilDe } from "@/lib/auth/roles";
import { listerAnnuaire, type CollaborateurResume } from "@/lib/services/collaborateurs/collaborateurs";
import { familleDe, libelleFonction, LIBELLE_FAMILLE_FONCTION, type FamilleFonction } from "@/lib/domain/collaborateur";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";
import { Arrivee } from "./arrivee";

export const metadata: Metadata = { title: "Collaborateurs - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Qui est la, sur quel portefeuille, avec quels droits (Sekou, 16/09/2026). Reserve a la
// direction : ce qu'on ecrit ici va dans le referentiel du patron (public."User",
// public."Copropriete").

export default async function CollaborateursPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!estDirection(profilDe(g))) redirect("/accueil");
  const annuaire = await listerAnnuaire();
  const enPoste = annuaire.collaborateurs.filter((c) => c.enPoste);
  const partis = annuaire.collaborateurs.filter((c) => !c.enPoste);
  const familles: FamilleFonction[] = ["direction", "syndic", "transaction", "location", "accueil"];
  const parFamille = (f: FamilleFonction) => enPoste.filter((c) => familleDe(c) === f);
  const { sansGestionnaire, sansAssistant } = annuaire.orphelines;

  return (
    <AppShell user={g} active="collaborateurs" breadcrumb="Collaborateurs">
      <Page largeur="travail">
        <PageHeader
          titre="Collaborateurs"
          eyebrow={`${enPoste.length} en poste · ${partis.length} parti${partis.length > 1 ? "s" : ""}`}
          aide={
            <p>
              L&apos;annuaire du cabinet vient du référentiel (rôle, agence, directeur référent) ; l&apos;intranet y ajoute les
              arrivées, les départs et les habilitations. Le portefeuille, c&apos;est ce que chaque copropriété dit de son
              gestionnaire, de son assistant et de son comptable. Un départ réaffecte le portefeuille avant de désactiver la
              personne — pour ne jamais se demander « qui est sur quoi ».
            </p>
          }
        />

        {sansGestionnaire.length > 0 && (
          <Callout ton="warn" titre={`${sansGestionnaire.length} copropriété${sansGestionnaire.length > 1 ? "s" : ""} sans gestionnaire en poste`}>
            {sansGestionnaire.map((e) => e.code).join(", ")}.
          </Callout>
        )}
        {sansAssistant.length > 0 && (
          // Beaucoup de copros (ML, HLS) n'ont pas d'assistant au referentiel : une information, pas une alerte.
          <p className="text-meta text-ink-3">{sansAssistant.length} copropriétés actives sans assistant renseigné au référentiel.</p>
        )}

        <Section id="collab-arrivee" titre="Nouvelle arrivée">
          <Arrivee agences={annuaire.agences} directeurs={enPoste.filter((c) => ["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"].includes(c.roleTable ?? "")).map((c) => ({ id: c.id, nom: c.nomComplet }))} />
        </Section>

        {familles.map((f) => {
          const lignes = parFamille(f);
          if (lignes.length === 0) return null;
          return (
            <Section key={f} id={`collab-${f}`} titre={LIBELLE_FAMILLE_FONCTION[f]} compte={lignes.length}>
              <TableCollab lignes={lignes} />
            </Section>
          );
        })}
        {partis.length > 0 && (
          <Section id="collab-partis" titre="Partis" compte={partis.length}>
            <TableCollab lignes={partis} />
          </Section>
        )}
      </Page>
    </AppShell>
  );
}

function TableCollab({ lignes }: { lignes: CollaborateurResume[] }) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Collaborateur</Th>
          <Th>Fonction</Th>
          <Th>Agence</Th>
          <Th numeric>Portefeuille</Th>
          <Th>Habilitations</Th>
          <Th>Arrivée · départ</Th>
        </tr>
      </Thead>
      <Tbody>
        {lignes.map((c) => (
          <Tr key={c.id} interactive>
            <Td principal>
              <LienLigne href={`/collaborateurs/${c.id}`}>{c.nomComplet}</LienLigne>
              {c.email && <span className="block text-meta text-ink-3">{c.email}</span>}
            </Td>
            <Td secondaire>{libelleFonction(c)}{!c.fonction && c.roleTable === "AUTRE" && <span className="text-warn-700"> · à préciser</span>}</Td>
            <Td secondaire>{c.agenceCode ?? "—"}</Td>
            <Td numeric className="tabular-nums">
              {c.nbCopros === 0 ? "—" : [c.nbGestionnaire ? `${c.nbGestionnaire} gérées` : null, c.nbAssistant ? `${c.nbAssistant} assistées` : null, c.nbComptable ? `${c.nbComptable} en compta` : null].filter(Boolean).join(" · ")}
            </Td>
            <Td secondaire>
              {c.habilitations.filter((h) => !h.jusquaISO).map((h) => (
                <Badge key={h.id} ton="brand">référent {h.agence}</Badge>
              ))}
            </Td>
            <Td secondaire className="tabular-nums">
              {c.arriveeISO ? formatJour(c.arriveeISO) : "—"}
              {c.departISO && <span className="text-err-700"> · parti le {formatJour(c.departISO)}</span>}
              {!c.actif && !c.departISO && <span className="text-ink-3"> · inactif</span>}
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
