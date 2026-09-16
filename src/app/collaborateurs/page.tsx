import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estDirection, profilDe } from "@/lib/auth/roles";
import { listerAnnuaire, type CollaborateurResume } from "@/lib/services/collaborateurs/collaborateurs";
import { LIBELLE_ROLE_TABLE, type RoleTable } from "@/lib/domain/collaborateur";
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
  const syndic = enPoste.filter((c) => ["ADMIN", "DIRECTEUR_SYNDIC", "GESTIONNAIRE", "ASSISTANT", "COMPTABLE"].includes(c.roleTable ?? ""));
  const autres = enPoste.filter((c) => !syndic.includes(c));
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

        {(sansGestionnaire.length > 0 || sansAssistant.length > 0) && (
          <Callout ton="warn" titre="Des copropriétés sans responsable en poste">
            {sansGestionnaire.length > 0 && <p>Sans gestionnaire : {sansGestionnaire.map((e) => e.code).join(", ")}.</p>}
            {sansAssistant.length > 0 && <p>Sans assistant : {sansAssistant.length > 12 ? `${sansAssistant.slice(0, 12).map((e) => e.code).join(", ")}… (${sansAssistant.length})` : sansAssistant.map((e) => e.code).join(", ")}.</p>}
          </Callout>
        )}

        <Section id="collab-arrivee" titre="Nouvelle arrivée">
          <Arrivee agences={annuaire.agences} directeurs={enPoste.filter((c) => ["ADMIN", "DIRECTEUR_SYNDIC", "DIRECTEUR_AGENCE"].includes(c.roleTable ?? "")).map((c) => ({ id: c.id, nom: c.nomComplet }))} />
        </Section>

        <Section id="collab-syndic" titre="Le syndic" compte={syndic.length}>
          <TableCollab lignes={syndic} />
        </Section>
        <Section id="collab-autres" titre="Vente, location, accueil, direction d'agence" compte={autres.length}>
          <TableCollab lignes={autres} />
        </Section>
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
          <Th>Rôle</Th>
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
              {c.email && <span className="block text-caption text-ink-3">{c.email}</span>}
            </Td>
            <Td secondaire>{c.roleTable ? (LIBELLE_ROLE_TABLE[c.roleTable as RoleTable] ?? c.roleTable) : "—"}</Td>
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
