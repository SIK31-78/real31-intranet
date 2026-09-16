import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
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

export const metadata: Metadata = { title: "Préparer l'offre - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'offre (ADR-039, brique 2) : le contrat prospect a imprimer et le mail a copier dans
// Outlook. Les choix (AG, debut, duree) voyagent dans l'URL : la page d'impression les
// relit telle quelle, sans etat.

type Params = { ag?: string; debut?: string; duree?: string };

function lireOptions(sp: Params) {
  const jour = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const duree = Number(sp.duree);
  return {
    ...(jour(sp.ag) ? { dateAgISO: jour(sp.ag) } : {}),
    ...(jour(sp.debut) ? { debutISO: jour(sp.debut) } : {}),
    ...(Number.isInteger(duree) && duree > 0 ? { dureeMois: duree } : {}),
  };
}

export default async function OffrePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Params> }) {
  const { id } = await params;
  const sp = await searchParams;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  if (!peutFaireOffre(profilDe(g))) redirect(`/propositions/${id}`);
  const options = lireOptions(sp);
  let offre;
  try {
    offre = await preparerOffre(id, options, { nom: g.nomComplet });
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) notFound();
    throw e;
  }
  const { proposition: p, champs, obstacles, erreurContrat, mail } = offre;
  const query = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
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
              L&apos;offre part par mail avec le contrat en pièce jointe. Ajustez l&apos;AG, le début et la durée, imprimez le
              contrat en PDF, copiez le mail dans Outlook et ajoutez-y les pièces fixes de l&apos;agence (présentation du service,
              démarches de changement de syndic, modèle de courrier). Puis marquez l&apos;offre comme remise : la fiche en garde
              la trace.
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
              <MailOffre texte={mail} />
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
                {erreurContrat && <p className="text-caption text-err-700">{erreurContrat}</p>}
              </form>
              <div className="flex flex-col gap-3 p-4">
                {champs ? (
                  <ButtonLink href={`/propositions/${p.id}/offre/imprimer${query ? `?${query}` : ""}`} variant="primary" target="_blank">
                    <FileText strokeWidth={1.5} /> Imprimer le contrat (PDF)
                  </ButtonLink>
                ) : (
                  <Button type="button" variant="primary" disabled><FileText strokeWidth={1.5} /> Imprimer le contrat (PDF)</Button>
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
