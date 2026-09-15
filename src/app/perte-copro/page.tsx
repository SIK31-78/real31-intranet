import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getCoproRepository } from "@/lib/adapters/router";
import { listerDossiersPerte } from "@/lib/services/perte/dossier-perte";
import { definitionEtape, echeanceEtape } from "@/lib/domain/perte/dossier";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Rows, Row } from "@/components/ui/list-rows";
import { OuvrirDossierPerte } from "./ouvrir-dossier";

export const metadata: Metadata = { title: "Perte de copropriété - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Module PERTE de copropriete (Sekou, 15/09/2026) : le miroir de la reprise. Un dossier par
// copro qui quitte le cabinet, avec la checklist de la fiche process datee depuis l'AG qui
// a nomme le nouveau syndic. Tableau de suivi d'equipe : tout le monde voit, tout le
// monde avance ; la gestion des roles viendra plus tard (roadmap).

export default async function PerteCoproPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO = new Date().toISOString().slice(0, 10);
  const [dossiers, toutes] = await Promise.all([
    listerDossiersPerte(aujourdhuiISO),
    getCoproRepository().listerToutes(),
  ]);
  const enCours = dossiers.filter((d) => d.statut === "en_cours");
  const termines = dossiers.filter((d) => d.statut === "termine");
  const actives = toutes
    .filter((c) => c.statut === "active")
    .map((c) => ({ code: c.code, nom: c.nom }))
    .sort((a, b) => a.code.localeCompare(b.code, "fr", { numeric: true }));

  return (
    <AppShell user={g} active="perte" breadcrumb="Perte de copropriété">
      <Page largeur="travail">
        <PageHeader
          titre="Perte de copropriété"
          eyebrow={`${enCours.length} en cours · ${termines.length} terminé${termines.length > 1 ? "s" : ""}`}
          aide={
            <p>
              Quand une AG nomme un autre syndic, tout ce qu&apos;il reste à faire — comptables à informer,
              archives, clés, registre, espace client, clôture comptable — daté depuis cette AG. La copropriété
              passe inactive au référentiel dès l&apos;ouverture du dossier.
            </p>
          }
        />

        <Section id="perte-ouvrir" titre="Perdre une copropriété">
          <Card>
            <CardBody>
              <OuvrirDossierPerte copros={actives} aujourdhuiISO={aujourdhuiISO} />
            </CardBody>
          </Card>
        </Section>

        <Section id="perte-en-cours" titre="En cours" compte={enCours.length}>
          {enCours.length === 0 ? (
            <EmptyState>Aucune perte en cours</EmptyState>
          ) : (
            <Rows>
              {enCours.map((d) => {
                const p = d.prochaine;
                const def = p ? definitionEtape(p.code) : undefined;
                const echeance = p ? echeanceEtape(d.dateAgISO, p.code) : null;
                return (
                  <Row
                    key={d.id}
                    href={`/perte-copro/${d.id}`}
                    ton={d.avancement.bloquees > 0 ? "err" : d.avancement.enRetard > 0 ? "warn" : undefined}
                    avant={d.coproCode}
                    principal={d.coproNom}
                    secondaire={
                      <>
                        AG du {formatDateLongue(d.dateAgISO)}
                        {def && (
                          <span className="text-ink-2">
                            {" "}· prochaine étape : {def.libelle.length > 70 ? `${def.libelle.slice(0, 70)}…` : def.libelle}
                            {echeance && ` (pour le ${formatDateLongue(echeance)})`}
                          </span>
                        )}
                      </>
                    }
                    droite={
                      <span className="flex items-center gap-2">
                        {d.avancement.enRetard > 0 && (
                          <Badge ton="warn" dot>{d.avancement.enRetard} en retard</Badge>
                        )}
                        {d.avancement.bloquees > 0 && (
                          <Badge ton="err" dot>{d.avancement.bloquees} bloquée{d.avancement.bloquees > 1 ? "s" : ""}</Badge>
                        )}
                        <Badge ton="neutral">{d.avancement.faites}/{d.avancement.total}</Badge>
                      </span>
                    }
                  />
                );
              })}
            </Rows>
          )}
        </Section>

        {termines.length > 0 && (
          <Section id="perte-termines" titre="Terminés" compte={termines.length}>
            <Rows>
              {termines.map((d) => (
                <Row
                  key={d.id}
                  href={`/perte-copro/${d.id}`}
                  avant={d.coproCode}
                  principal={d.coproNom}
                  secondaire={<>AG du {formatDateLongue(d.dateAgISO)} · gérée jusqu&apos;au {formatDateLongue(d.finGestionISO)}</>}
                  droite={<Badge ton="ok">terminé</Badge>}
                />
              ))}
            </Rows>
          </Section>
        )}
      </Page>
    </AppShell>
  );
}
