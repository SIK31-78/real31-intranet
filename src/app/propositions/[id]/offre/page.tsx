import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { BoutonPdf } from "@/components/contrat/bouton-pdf";
import { exigerAccesPropositions } from "@/app/propositions/acces";
import { peutFaireOffre, profilDe } from "@/lib/auth/roles";
import { preparerOffre } from "@/lib/services/proposition/propositions";
import { libelleAdresse } from "@/lib/domain/proposition/proposition";
import { alerteDebutAvantAg } from "@/lib/domain/proposition/offre";
import { formatJour } from "@/lib/services/facturation/format";
import { avertissementSiegeAgence } from "@/lib/domain/salles-reunion";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { Button, ButtonLink } from "@/components/ui/button";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Section } from "@/components/ui/section";
import { ChoixCycle } from "./choix-cycle";
import { MailOffre, MarquerOffreRemise } from "./mail-offre";
import { lireOptionsOffre, queryOffre, type ParamsOffre } from "./options";

export const metadata: Metadata = { title: "Préparer l'offre - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'offre (ADR-039, brique 2) : le contrat prospect a imprimer et le mail a copier dans
// Outlook. Les choix (AG, debut, duree) voyagent dans l'URL, mise a jour a la saisie
// (ChoixCycle) : la page d'impression et le PDF la relisent telle quelle, sans etat.

export default async function OffrePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ParamsOffre> }) {
  const { id } = await params;
  const sp = await searchParams;
  const g = await exigerAccesPropositions();
  const options = lireOptionsOffre(sp);
  let offre;
  try {
    offre = await preparerOffre(id, options, { nom: g.nomComplet });
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) notFound();
    throw e;
  }
  const { proposition: p, cycle, champs, obstacles, erreurContrat, mail } = offre;
  if (!peutFaireOffre(profilDe(g), p.agence)) redirect(`/propositions/${id}`);
  const query = queryOffre(sp);
  const alerte = alerteDebutAvantAg(cycle);

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${libelleAdresse(p.immeuble)} · Offre`}>
      <Page largeur="travail">
        <PageHeader
          titre="Préparer l'offre"
          eyebrow={[libelleAdresse(p.immeuble), p.immeuble.commune, p.agence ? `agence ${p.agence}` : null].filter(Boolean).join(" · ")}
          meta={
            p.prix.honorairesTtc !== undefined
              ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC par an · ${p.immeuble.lotsPrincipaux ?? "?"} lots principaux · frais postaux ${p.prix.fraisPostauxReels ?? true ? "au réel" : "au forfait"}`
              : undefined
          }
          actions={<ButtonLink href={`/propositions/${p.id}`} variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Fiche</ButtonLink>}
          aide={
            <p>
              Ajustez l&apos;AG, le début et la durée (le contrat et le mail suivent aussitôt), relisez le mail, puis envoyez : il part de votre boîte, au contact de la
              fiche, avec le contrat en PDF. La fiche garde la trace de l&apos;envoi.
            </p>
          }
        />

        {/* Agence sans siege connu : le contrat sortirait avec un blanc a la place de
            l'adresse de l'agence (REA-273) ; le serveur l'a deja signale. */}
        {champs && avertissementSiegeAgence(champs.copro.agence) && (
          <Callout ton="warn" titre="Adresse de l'agence manquante">
            {avertissementSiegeAgence(champs.copro.agence)}
          </Callout>
        )}

        {obstacles.length > 0 && (
          <Callout ton="warn" titre="Il manque encore" actions={<ButtonLink href={`/propositions/${p.id}`} variant="secondary" size="sm">Compléter la fiche</ButtonLink>}>
            {obstacles.join(", ")}.
          </Callout>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
          <div className="flex flex-col gap-5 min-w-0">
            <Section id="offre-mail" titre="Le mail à envoyer">
              {/* Remonte a chaque recalcul : le texte retouche est un etat local, il doit
                  reprendre les nouvelles dates (sinon l'envoi partait avec les anciennes). */}
              <MailOffre
                key={query}
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
              <div className="flex flex-col gap-3 p-4">
                <h2 className="text-body font-medium text-ink">Le contrat</h2>
                <ChoixCycle
                  base={`/propositions/${p.id}/offre`}
                  saisis={sp}
                  calcules={{ ag: cycle.dateAgISO, debut: cycle.debutISO, duree: String(options.dureeMois ?? 12) }}
                />
                {alerte && (
                  <Callout ton="warn" titre="Début avant l'AG">
                    {alerte} Vérifiez les dates avant d&apos;envoyer.
                  </Callout>
                )}
                {champs && (
                  <DataList align="left">
                    <DataRow label="Contrat">
                      {champs.debutISO ? `du ${formatJour(champs.debutISO)} au ${formatJour(champs.finISO)}` : "dates en blanc"} ({champs.dureeTexte})
                    </DataRow>
                    {!champs.dateAgISO && <DataRow label="AG">en blanc, à compléter</DataRow>}
                    <DataRow label="Honoraires">{champs.honorairesGestionTtc.toLocaleString("fr-FR")} € TTC ({champs.honorairesGestionHt} € HT)</DataRow>
                    <DataRow label="Frais postaux">{champs.fraisPostauxReels ? "au réel" : `forfait ${champs.forfaitPostauxTtc.toLocaleString("fr-FR")} € TTC`}</DataRow>
                    <DataRow label="Barème">{champs.anneeBareme}</DataRow>
                  </DataList>
                )}
                {erreurContrat && <p className="text-meta text-err-700">{erreurContrat}</p>}
              </div>
              <div className="flex flex-col gap-3 p-4">
                {champs ? (
                  <>
                    <BoutonPdf href={`/propositions/${p.id}/offre/contrat.pdf${query}`} variant="secondary" enfants="Télécharger le contrat (PDF)" />
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
