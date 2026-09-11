import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getContrat, getEditionsContrat } from "@/lib/services/contrat/get-contrat";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { formatEuros, formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Section } from "@/components/ui/section";
import { Table, Thead, Tbody, Th, Tr, Td } from "@/components/ui/table";
import { FormulaireContrat } from "@/components/contrat/formulaire-contrat";
import { Callout } from "@/components/ui/callout";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Contrat de syndic - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Preparation du contrat de syndic : ce que le document VA dire, avant de l'editer.
// Reprend le `NewContractScreen` du canvas PowerApps MYTHEC, en beaucoup plus court :
// les 22 tarifs ne sont plus saisis un par un, ils viennent du bareme de l'annee.

export default async function ContratPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");

  let champs;
  try {
    champs = await getContrat(code);
  } catch (e) {
    const message = (e as Error).message;
    if (/introuvable/.test(message)) notFound();
    // Mandat sans date de fin, bareme incomplet, honoraires inconnus : toutes des causes
    // que le gestionnaire peut corriger. On les dit, on ne cache pas l'ecran.
    return (
      <AppShell user={g} active="contrat" breadcrumb={`Copropriétés · ${code} · Contrat`}>
        <Page largeur="travail">
          <PageHeader titre="Contrat de syndic" eyebrow={code} />
          <Callout ton="err" titre="Contrat impossible à éditer">
            {message}
          </Callout>
          <div>
            <ButtonLink href={`/copropriete/${code}`} variant="secondary">
              Retour à la copropriété
            </ButtonLink>
          </div>
        </Page>
      </AppShell>
    );
  }

  // L'historique est un CONFORT : s'il est vide (table pas encore creee), l'ecran
  // fonctionne comme avant.
  const editions = await getEditionsContrat(code);
  const { copro } = champs;
  const adresse = [copro.adresse1, copro.adresse2, copro.adresse3]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell user={g} active="contrat" breadcrumb={`Copropriétés · ${code} · Contrat`}>
      <Page largeur="travail">
        <PageHeader
          titre="Contrat de syndic"
          eyebrow={`${copro.nom} · ${code}`}
        />

        {/* Les trois valeurs ajustables AVANT d'editer : elles changent a chaque
            renouvellement (augmentation votee en AG), cf. formulaire-contrat.tsx. */}
        <Card>
          <CardBody>
            <FormulaireContrat
              coproCode={code}
              dateAgISO={champs.dateAgISO}
              honorairesTtc={champs.honorairesGestionTtc}
              forfaitPostauxTtc={champs.forfaitPostauxTtc}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <DataList align="left">
              <DataRow label="Période">
                {formatJour(champs.debutISO)} → {formatJour(champs.finISO)}
              </DataRow>
              <DataRow label="Durée">{champs.dureeTexte}</DataRow>
              <DataRow label="Assemblée générale">{formatJour(champs.dateAgISO)}</DataRow>
              <DataRow label="Honoraires de gestion">
                {formatEuros(champs.honorairesGestionTtc)} TTC
              </DataRow>
              <DataRow label="Forfait timbres">
                {formatEuros(champs.forfaitPostauxTtc)} TTC
              </DataRow>
              <DataRow label="Barème appliqué">{champs.anneeBareme}</DataRow>
            </DataList>
          </CardBody>
        </Card>

        <Section id="contrat-copro" titre="Ce que le contrat reprend de la copropriété">
          <Card>
            <CardBody>
              <DataList align="left">
                <DataRow label="Adresse">
                  {adresse} · {copro.codePostal} {copro.ville}
                </DataRow>
                <DataRow label="Immatriculation">{copro.immatriculation || "—"}</DataRow>
                <DataRow label="Assurance">{copro.assurance || "—"}</DataRow>
                <DataRow label="Agence">{copro.agence || "—"}</DataRow>
                <DataRow label="Lots">
                  {copro.lotsPrincipaux} principaux · {copro.lotsAutres} autres
                </DataRow>
                <DataRow label="Prestations incluses">
                  {copro.nbVisites} visite(s) · AG {copro.dureeAgHeures} h · {copro.nbCs} CS de{" "}
                  {copro.dureeCsHeures} h
                </DataRow>
              </DataList>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="contrat-tarifs"
          titre="Prestations particulières"
          compte={champs.tarifs.length}
        >
          <Table>
            <Thead>
              <tr>
                <Th>Prestation</Th>
                <Th numeric>HT</Th>
                <Th numeric>TTC</Th>
              </tr>
            </Thead>
            <Tbody>
              {champs.tarifs.map((t) => (
                <Tr key={t.identifiant}>
                  <Td principal>{t.libelle}</Td>
                  <Td numeric className="tabular-nums">{t.ht}</Td>
                  <Td numeric className="tabular-nums">{t.ttcTexte}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Section>
        {editions.length > 0 && (
          <Section
            id="contrat-historique"
            titre="Contrats déjà édités"
            compte={editions.length}
          >
            <Table dense>
              <Thead>
                <tr>
                  <Th>Édité le</Th>
                  <Th>Par</Th>
                  <Th>AG</Th>
                  <Th numeric>Honoraires</Th>
                  <Th numeric>Timbres</Th>
                  <Th numeric>Statut</Th>
                </tr>
              </Thead>
              <Tbody>
                {editions.slice(0, 10).map((e) => (
                  <Tr key={`${e.creeLe}-${e.titre ?? ""}`} ton={e.statut === "erreur" ? "err" : undefined}>
                    <Td principal className="tabular-nums">
                      {formatJour(e.creeLe.slice(0, 10))}
                    </Td>
                    <Td secondaire>{e.creePar ?? "—"}</Td>
                    <Td secondaire className="tabular-nums">
                      {e.dateAgISO ? formatJour(e.dateAgISO) : "—"}
                    </Td>
                    <Td numeric className="tabular-nums">
                      {e.honorairesGestionTtc === null ? "—" : formatEuros(e.honorairesGestionTtc)}
                    </Td>
                    <Td numeric className="tabular-nums">
                      {e.forfaitPostauxTtc === null ? "—" : formatEuros(e.forfaitPostauxTtc)}
                    </Td>
                    <Td numeric>
                      {e.statut === "erreur" ? (
                        <Badge ton="err" title={e.messageErreur ?? undefined}>
                          Échec
                        </Badge>
                      ) : (
                        <Badge ton="ok">Édité</Badge>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </Section>
        )}
      </Page>
    </AppShell>
  );
}
