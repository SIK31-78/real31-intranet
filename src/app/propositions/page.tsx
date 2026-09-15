import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { listerPropositions, type PropositionResume } from "@/lib/services/proposition/propositions";
import { LIBELLE_ORIGINE, LIBELLE_STATUT, STATUTS_OUVERTS, type StatutProposition } from "@/lib/domain/proposition/proposition";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat } from "@/components/ui/stat";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";

export const metadata: Metadata = { title: "Propositions de contrat - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le pipeline commercial (ADR-039) : ce qui remplace l'Excel « Suivi Proposition reprise
// syndic ». En haut ce qui est ouvert (en cours, accepte par le CS, reporte), en dessous
// l'historique - 1 161 propositions depuis 2012, la memoire du cabinet.

const TON: Record<StatutProposition, "ok" | "warn" | "err" | "neutral" | "info"> = {
  en_cours: "info",
  accepte_cs: "warn",
  reporte: "neutral",
  elu: "ok",
  refuse_cs: "err",
  refuse_ag: "err",
  refuse_real31: "neutral",
};

export default async function PropositionsPage({ searchParams }: { searchParams: Promise<{ agence?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const { agence } = await searchParams;
  const toutes = await listerPropositions();
  const filtrees = agence ? toutes.filter((p) => p.agence === agence) : toutes;
  const ouvertes = filtrees.filter((p) => STATUTS_OUVERTS.has(p.statut));
  const closes = filtrees.filter((p) => !STATUTS_OUVERTS.has(p.statut));
  const agences = [...new Set(toutes.map((p) => p.agence).filter((a): a is string => Boolean(a)))].sort();
  const elues = filtrees.filter((p) => p.statut === "elu").length;
  const decidees = filtrees.filter((p) => ["elu", "refuse_cs", "refuse_ag"].includes(p.statut)).length;

  return (
    <AppShell user={g} active="propositions" breadcrumb="Propositions de contrat">
      <Page largeur="travail">
        <PageHeader
          titre="Propositions de contrat de syndic"
          eyebrow={`${ouvertes.length} en cours · ${filtrees.length} au total`}
          actions={
            <ButtonLink href="/propositions/nouvelle" variant="primary">
              <Plus strokeWidth={1.5} /> Nouvelle proposition
            </ButtonLink>
          }
          aide={
            <p>
              Un appel, une visite, une offre : tout ce qui pourrait devenir une copropriété gérée. L&apos;adresse
              interroge le registre national des copropriétés (lots, syndic en place, fin de son mandat) ; le prix vient
              de la grille du cabinet et s&apos;ajuste librement — le client ne voit que le montant retenu.
            </p>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/propositions" variant={agence ? "ghost" : "secondary"} size="sm">Toutes les agences</ButtonLink>
          {agences.map((a) => (
            <ButtonLink key={a} href={`/propositions?agence=${encodeURIComponent(a)}`} variant={agence === a ? "secondary" : "ghost"} size="sm">{a}</ButtonLink>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="En cours" valeur={String(ouvertes.filter((p) => p.statut === "en_cours").length)} />
          <Stat label="Acceptées par le CS" valeur={String(ouvertes.filter((p) => p.statut === "accepte_cs").length)} />
          <Stat label="Élues" valeur={String(elues)} />
          <Stat label="Transformation (hors refus REAL 31)" valeur={decidees ? `${Math.round((elues / decidees) * 100)} %` : "—"} />
        </div>

        <Section id="propositions-ouvertes" titre="En cours" compte={ouvertes.length}>
          {ouvertes.length === 0 ? <EmptyState>Aucune proposition en cours</EmptyState> : <TableProps lignes={ouvertes} ouvertes />}
        </Section>

        <Section id="propositions-historique" titre="Historique" compte={closes.length}>
          {closes.length === 0 ? <EmptyState>Aucune proposition close</EmptyState> : <TableProps lignes={closes.slice(0, 200)} />}
          {closes.length > 200 && <p className="text-caption text-ink-3 mt-2">Les 200 plus récentes sont affichées.</p>}
        </Section>
      </Page>
    </AppShell>
  );
}

function TableProps({ lignes, ouvertes = false }: { lignes: PropositionResume[]; ouvertes?: boolean }) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Immeuble</Th>
          <Th>Agence</Th>
          <Th numeric>Lots</Th>
          <Th>Contact</Th>
          <Th>{ouvertes ? "1er contact" : "Décision"}</Th>
          <Th numeric>Honoraires TTC</Th>
          <Th numeric>Statut</Th>
        </tr>
      </Thead>
      <Tbody>
        {lignes.map((p) => (
          <Tr key={p.id} interactive>
            <Td principal>
              <LienLigne href={`/propositions/${p.id}`}>{p.immeuble.adresse}</LienLigne>
              {p.immeuble.commune && <span className="text-ink-3"> · {p.immeuble.commune}</span>}
              {ouvertes && p.manquant.length > 0 && (
                <span className="block text-caption text-warn-700">manque : {p.manquant.slice(0, 3).join(", ")}{p.manquant.length > 3 ? "…" : ""}</span>
              )}
            </Td>
            <Td secondaire>{p.agence ?? "—"}</Td>
            <Td numeric className="tabular-nums">{p.immeuble.lotsPrincipaux ?? "—"}</Td>
            <Td secondaire>
              {p.contact.nom ?? "—"}
              {p.origine && <span className="text-ink-3"> · {LIBELLE_ORIGINE[p.origine]}</span>}
            </Td>
            <Td secondaire className="tabular-nums">
              {ouvertes ? (p.premierContactISO ? formatJour(p.premierContactISO) : "—") : p.decisionISO ? formatJour(p.decisionISO) : p.premierContactISO ? formatJour(p.premierContactISO) : "—"}
            </Td>
            <Td numeric className="tabular-nums">{p.prix.honorairesTtc !== undefined ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} €` : "—"}</Td>
            <Td numeric><Badge ton={TON[p.statut]}>{LIBELLE_STATUT[p.statut]}</Badge></Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
