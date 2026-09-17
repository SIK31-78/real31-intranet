import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutFaireOffre, profilDe } from "@/lib/auth/roles";
import { preparerOffre } from "@/lib/services/proposition/propositions";
import { DUREES_CONTRAT_MOIS } from "@/lib/domain/contrat/cycle-contrat";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Section } from "@/components/ui/section";
import { MailOffre, MarquerOffreRemise } from "./mail-offre";
import { lireOptionsOffre, queryOffre, type ParamsOffre } from "./options";

export const metadata: Metadata = { title: "Préparer l'offre - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'offre (ADR-039, brique 2) : le contrat prospect a imprimer et le mail a copier dans
// Outlook. Les choix (AG, debut, duree) voyagent dans l'URL : la page d'impression les
// relit telle quelle, sans etat.

export default async function OffrePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParamsOffre> }) {
  const { id } = await params;
  const sp = await searchParams;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const options = lireOptionsOffre(sp);
  let offre;
  try {
    offre = await preparerOffre(id, options, { nom: g.nomComplet });
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) notFound();
    throw e;
  }
  const { proposition: p, champs, obstacles, erreurContrat, mail } = offre;
  if (!peutFaireOffre(profilDe(g), p.agence)) redirect(`/propositions/${id}`);
  const query = queryOffre(sp);
  const dureeMois = options.dureeMois ?? 12;

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${p.immeuble.adresse} · Offre`}>
      <Page largeur="travail">
        <PageHeader
          titre="Préparer l'offre"
          eyebrow={[p.immeuble.adresse, p.immeuble.commune, p.agence ? `agence ${p.agence}` : null].filter(Boolean).join(" · ")}
          meta={
            p.prix.honorairesTtc !== undefined
              ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC par an · ${p.immeuble.lotsPrincipaux ?? "?"} lots principaux · frais postaux ${p.prix.fraisPostauxReels ?? true ? "au réel" : "au forfait"}`
              : undefined
          }
          actions={<ButtonLink href={`/propositions/${p.id}`} variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Fiche</ButtonLink>}
          aide={
            <p>
              Ajustez l&apos;AG, le début et la durée, relisez le mail, puis envoyez : il part de votre boîte, au contact de la
              fiche, avec le contrat en PDF. La fiche garde la trace de l&apos;envoi.
            </p>
          }
        />

        {obstacles.length > 0 && (
          <Callout ton="warn" titre="Il manque encore" actions={<ButtonLink href={`/propositions/${p.id}`} variant="secondary" size="sm">Compléter la fiche</ButtonLink>}>
            {obstacles.join(", ")}.
          </Callout>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            <Section id="offre-mail" titre="Le mail à envoyer">
              <MailOffre
                texte={mail}
                propositionId={p.id}
                options={options}
                contactEmail={p.contact.email?.trim() || undefined}
                contratPret={!!champs}
                dejaRemiseISO={p.remisePropositionISO}
              />
            </Section>
          </div>

          <Card>
            <div className="divide-y divide-line">
              <form method="get" className="flex flex-col gap-3 p-4">
                <h2 className="text-body font-medium text-ink">Le contrat</h2>
                <Field label="AG qui votera le contrat" htmlFor="o-ag"><Input id="o-ag" name="ag" type="date" defaultValue={champs?.dateAgISO ?? options.dateAgISO ?? ""} /></Field>
                <Field label="Début du mandat" htmlFor="o-debut" hint="lendemain de la fin du mandat en place, sinon le jour de l'AG"><Input id="o-debut" name="debut" type="date" defaultValue={champs?.debutISO ?? options.debutISO ?? ""} /></Field>
                <Field label="Durée" htmlFor="o-duree">
                  <Select id="o-duree" name="duree" defaultValue={String(dureeMois)}>
                    {DUREES_CONTRAT_MOIS.map((d) => <option key={d.mois} value={d.mois}>{d.libelle}</option>)}
                    {!DUREES_CONTRAT_MOIS.some((d) => d.mois === dureeMois) && <option value={dureeMois}>{dureeMois} mois</option>}
                  </Select>
                </Field>
                <Button type="submit" variant="secondary" size="sm">Recalculer</Button>
                {champs && (
                  <DataList align="left">
                    <DataRow label="Contrat">du {formatJour(champs.debutISO)} au {formatJour(champs.finISO)} ({champs.dureeTexte})</DataRow>
                    <DataRow label="Honoraires">{champs.honorairesGestionTtc.toLocaleString("fr-FR")} € TTC ({champs.honorairesGestionHt} € HT)</DataRow>
                    <DataRow label="Frais postaux">{champs.fraisPostauxReels ? "au réel" : `forfait ${champs.forfaitPostauxTtc.toLocaleString("fr-FR")} € TTC`}</DataRow>
                    <DataRow label="Barème">{champs.anneeBareme}</DataRow>
                  </DataList>
                )}
                {erreurContrat && <p className="text-meta text-err-700">{erreurContrat}</p>}
              </form>
              <div className="flex flex-col gap-3 p-4">
                {champs ? (
                  <>
                    <ButtonLink href={`/propositions/${p.id}/offre/contrat.pdf${query}`} variant="secondary">
                      <Download strokeWidth={1.5} /> Télécharger le contrat (PDF)
                    </ButtonLink>
                    <ButtonLink href={`/propositions/${p.id}/offre/imprimer${query}`} variant="ghost" size="sm" target="_blank">
                      <FileText strokeWidth={1.5} /> Aperçu à l&apos;écran
                    </ButtonLink>
                  </>
                ) : (
                  <Button type="button" variant="secondary" disabled><Download strokeWidth={1.5} /> Télécharger le contrat (PDF)</Button>
                )}
                <MarquerOffreRemise propositionId={p.id} options={options} disabled={!champs} dejaRemiseISO={p.remisePropositionISO} />
              </div>
            </div>
          </Card>
        </div>
      </Page>
    </AppShell>
  );
}
