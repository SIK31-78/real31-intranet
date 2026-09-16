import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { preparerElection } from "@/lib/services/proposition/election";
import { adressePourContrat } from "@/lib/domain/proposition/offre";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { FormulaireElection } from "./formulaire-election";

export const metadata: Metadata = { title: "Créer la copropriété - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// L'election (ADR-039, brique 3) : l'AG a vote, la proposition devient une copropriete du
// cabinet. Un bouton, jamais un simple changement de statut (Sekou, 16/09/2026) : on relit
// ce qui va etre cree - fiche App A, contrat, client Pennylane, dossier de reprise.

export default async function ElectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  let prep;
  try {
    prep = await preparerElection(id);
  } catch (e) {
    if (/introuvable/.test((e as Error).message)) notFound();
    throw e;
  }
  const p = prep.proposition;
  const agenceParDefaut = prep.agences.find((a) => a.code === p.agence)?.id ?? prep.agences.find((a) => a.id === g.agencyId)?.id;
  const gestionnaireParDefaut = prep.gestionnaires.find((x) => x.nomComplet === p.gestionnaire)?.id ?? g.id;

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${p.immeuble.adresse} · Élection`}>
      <Page largeur="lecture">
        <PageHeader
          titre="Créer la copropriété"
          eyebrow={[p.immeuble.adresse, p.immeuble.commune, p.agence ? `agence ${p.agence}` : null].filter(Boolean).join(" · ")}
          meta={`${p.immeuble.lotsPrincipaux ?? "?"} lots principaux · ${p.prix.honorairesTtc !== undefined ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC par an` : "prix non enregistré"}`}
          actions={<ButtonLink href={`/propositions/${p.id}`} variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Fiche</ButtonLink>}
          aide={
            <p>
              L&apos;assemblée générale nous a élus. En un clic : la fiche de la copropriété dans le référentiel (celle que
              toute l&apos;application utilise), le contrat en vigueur (celui que la facturation lit, tarifs figés au barème de
              l&apos;année de l&apos;AG), le client Pennylane et le dossier de reprise. Chaque étape est notée au journal ; si
              l&apos;une échoue, les précédentes restent et le message dit où on en est.
            </p>
          }
        />
        {prep.coproCode ? (
          <Callout ton="ok" titre={`Copropriété ${prep.coproCode} déjà créée`} actions={<ButtonLink href={`/copros/${prep.coproCode}`} variant="secondary" size="sm">Ouvrir la fiche</ButtonLink>}>
            Cette proposition a déjà donné une copropriété. Le journal de la fiche en garde les étapes.
          </Callout>
        ) : (
          <FormulaireElection
            propositionId={p.id}
            codePropose={prep.codePropose}
            nomPropose={prep.nomPropose}
            debutProposeISO={prep.debutProposeISO}
            agences={prep.agences}
            gestionnaires={prep.gestionnaires}
            agenceParDefaut={agenceParDefaut}
            gestionnaireParDefaut={gestionnaireParDefaut}
            immeuble={{ adresse: adressePourContrat(p.immeuble.adresse, p.immeuble.commune), codePostal: p.immeuble.codePostal, commune: p.immeuble.commune, immatriculation: p.immeuble.immatriculation, lots: p.immeuble.lotsPrincipaux, stationnements: p.immeuble.lotsStationnement, syndicActuel: p.immeuble.syndicActuel }}
            prix={{ honorairesTtc: p.prix.honorairesTtc, fraisPostauxReels: p.prix.fraisPostauxReels ?? true, timbresTtc: p.prix.timbresTtc }}
            pennylaneDisponible={Boolean(process.env.PENNYLANE_API_KEY)}
          />
        )}
      </Page>
    </AppShell>
  );
}
