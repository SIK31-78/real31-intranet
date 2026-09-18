import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { jourParis } from "@/lib/services/date-du-jour";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { estDirectionCles } from "@/lib/domain/cles/acteur";
import { ficheEntreprise } from "@/lib/services/cles/lecture";
import { LIBELLE_CONFORMITE } from "@/lib/domain/cles/types";
import { joursDehors, libelleDuree } from "@/lib/domain/cles/etat";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Rows, Row } from "@/components/ui/list-rows";
import { Callout } from "@/components/ui/callout";
import { Stat } from "@/components/ui/stat";
import { LigneTrousseau } from "@/components/cles/ligne-trousseau";
import { JournalTable } from "@/components/cles/journal-table";
import { EnTeteEntreprise } from "@/components/cles/en-tete-entreprise";

export const metadata: Metadata = { title: "Entreprise - Gestion des clés - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function EntreprisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO = jourParis();
  const [acteur, fiche] = await Promise.all([acteurCles(g), ficheEntreprise(id, aujourdhuiISO)]);
  if (!fiche) notFound();
  const { entreprise: e, detenus, enRetard, historique, reservations, mouvements, tauxRetard, numeros } = fiche;
  const prevues = reservations.filter((r) => r.statut === "prevue" && r.finPrevueISO >= aujourdhuiISO);

  return (
    <AppShell user={g} active="cles" breadcrumb={`Gestion des clés · ${e.nom}`}>
      <Page largeur="travail">
        <PageHeader
          titre={e.nom}
          eyebrow={[e.telephone, e.email, e.adresse?.ville].filter(Boolean).join(" · ") || undefined}
          badge={e.statut === "bloquee" ? <Badge ton="err" size="md" dot>bloquée{e.motifBlocage ? ` · ${e.motifBlocage}` : ""}</Badge> : enRetard > 0 ? <Badge ton="err" size="md" dot>{enRetard} trousseau{enRetard > 1 ? "x" : ""} en retard</Badge> : detenus.length > 0 ? <Badge ton="warn" size="md" dot>détient {detenus.length} trousseau{detenus.length > 1 ? "x" : ""}</Badge> : undefined}
          actions={
            <span className="flex items-center gap-2 flex-wrap justify-end">
              <EnTeteEntreprise entreprise={e} direction={estDirectionCles(acteur)} />
              <ButtonLink href="/cles/entreprises" variant="ghost" size="sm"><ArrowLeft strokeWidth={1.5} /> Entreprises</ButtonLink>
            </span>
          }
        />

        {e.statut === "bloquee" && <Callout ton="err" titre="Entreprise bloquée">{e.motifBlocage ?? "Sans motif enregistré."} Seule la direction peut lui confier un trousseau.</Callout>}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Détient" valeur={detenus.length} ton={detenus.length > 0 ? "warn" : "neutral"} />
          <Stat label="En retard" valeur={enRetard} ton={enRetard > 0 ? "err" : "neutral"} />
          <Stat label="Prêts clos" valeur={historique.length} />
          <Stat label="Rendus en retard" valeur={tauxRetard === null ? "aucun" : `${tauxRetard} %`} ton={tauxRetard !== null && tauxRetard >= 30 ? "err" : tauxRetard !== null && tauxRetard >= 10 ? "warn" : "neutral"} note={tauxRetard === null ? "pas d'historique" : "sur 24 mois"} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            {detenus.length > 0 && (
              <Section id="ent-detenus" titre="Trousseaux détenus" compte={detenus.length}>
                <Rows>
                  {detenus.map((p) => p.resume ? <LigneTrousseau key={p.id} resume={p.resume} sansDetenteur /> : <Row key={p.id} principal={numeros.get(p.trousseauId) ?? "?"} secondaire={`sorti le ${formatDateLongue(p.sortiLeISO.slice(0, 10))}`} />)}
                </Rows>
              </Section>
            )}
            {prevues.length > 0 && (
              <Section id="ent-resas" titre="Réservations à venir" compte={prevues.length}>
                <Rows>{prevues.map((r) => <Row key={r.id} href={`/cles/trousseaux/${r.trousseauId}`} avant={numeros.get(r.trousseauId)} principal={formatDateLongue(r.debutISO)} secondaire={<>{r.finPrevueISO !== r.debutISO ? `jusqu'au ${formatDateLongue(r.finPrevueISO)} · ` : ""}{r.motif ?? ""}</>} droite={<Badge ton="info" dot>prévue</Badge>} />)}</Rows>
              </Section>
            )}
            <Section id="ent-historique" titre="Historique des prêts" compte={historique.length}>
              {historique.length === 0 ? <p className="text-body text-ink-3">Aucun prêt clos.</p> : (
                <Rows>
                  {historique.slice(0, 100).map((p) => {
                    const tardif = (p.renduLeISO ?? "").slice(0, 10) > p.retourPrevuLeISO;
                    return (
                      <Row key={p.id} href={`/cles/trousseaux/${p.trousseauId}`} avant={numeros.get(p.trousseauId)} principal={formatDateLongue(p.sortiLeISO.slice(0, 10))} secondaire={<>rendu le {formatDateLongue(p.renduLeISO!.slice(0, 10))} ({libelleDuree(joursDehors(p, aujourdhuiISO))}){p.motif ? ` · ${p.motif}` : ""}{p.commentaireRetour ? ` · ${p.commentaireRetour}` : ""}</>} droite={<span className="flex gap-2">{p.retourConforme && p.retourConforme !== "complet" && <Badge ton="err">{LIBELLE_CONFORMITE[p.retourConforme]}</Badge>}{tardif && <Badge ton="err">en retard</Badge>}</span>} />
                    );
                  })}
                </Rows>
              )}
            </Section>
            <Section id="ent-journal" titre="Journal" compte={mouvements.length}>
              <JournalTable lignes={mouvements} />
            </Section>
          </div>
          <div className="flex flex-col gap-4">
            <Card>
              <CardBody>
                <DataList align="left">
                  {e.telephone && <DataRow label="Téléphone">{e.telephone}</DataRow>}
                  {e.email && <DataRow label="E-mail">{e.email}</DataRow>}
                  {e.adresse && (e.adresse.ligne1 || e.adresse.ville) && <DataRow label="Adresse">{[e.adresse.ligne1, e.adresse.ligne2, [e.adresse.codePostal, e.adresse.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</DataRow>}
                  <DataRow label="Contacts">
                    {e.contacts.length === 0 ? <span className="text-ink-3">aucun</span> : (
                      <ul className="flex flex-col gap-0.5">{e.contacts.map((c, i) => <li key={i}>{c.nom}{c.principal ? " (principal)" : ""}{c.telephone ? ` · ${c.telephone}` : ""}{c.email ? ` · ${c.email}` : ""}</li>)}</ul>
                    )}
                  </DataRow>
                  <DataRow label="Relances">{e.relances ? "oui" : "non"}</DataRow>
                  {e.note && <DataRow label="Note">{e.note}</DataRow>}
                  {e.source === "import_powerapps" && <DataRow label="Origine">reprise de PowerApps</DataRow>}
                </DataList>
              </CardBody>
            </Card>
          </div>
        </div>
      </Page>
    </AppShell>
  );
}
