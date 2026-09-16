import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2, FileText } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { MESSAGE_RESERVE_DIRECTION, peutCompleterProposition, peutElire, peutFaireOffre, peutVoirToutesLesPropositions, profilDe } from "@/lib/auth/roles";
import { getAgenceRepository } from "@/lib/adapters/router";
import { calculerPrix, contexteImmeuble, getProposition, suggererRapprochement } from "@/lib/services/proposition/propositions";
import { LIBELLE_STATUT, STATUTS_OUVERTS } from "@/lib/domain/proposition/proposition";
import { obstaclesOffre } from "@/lib/domain/proposition/offre";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FicheProposition } from "./fiche-proposition";

export const metadata: Metadata = { title: "Proposition de contrat - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function PropositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const p = await getProposition(id);
  if (!p) notFound();
  // Hors syndic (vente, location, accueil) : seulement les contacts qu'on a soi-meme notes.
  const profil = profilDe(g);
  if (!peutVoirToutesLesPropositions(profil) && p.creeParNom !== g.nomComplet) notFound();
  const droits = { completer: peutCompleterProposition(profil) || p.creeParNom === g.nomComplet, offre: peutFaireOffre(profil, p.agence), elire: peutElire(profil, p.agence) };
  const [prix, agences, contexte, suggestion] = await Promise.all([
    calculerPrix(p.immeuble),
    getAgenceRepository().listerAgences(),
    contexteImmeuble(p),
    p.immeuble.immatriculation ? Promise.resolve(undefined) : suggererRapprochement(p),
  ]);
  const obstacles = obstaclesOffre(p);
  const meta = [
    p.immeuble.lotsPrincipaux !== undefined ? `${p.immeuble.lotsPrincipaux} lots principaux` : null,
    p.prix.honorairesTtc !== undefined ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} € TTC retenus` : null,
    p.contact.nom ?? null,
    contexte.copro ? (contexte.copro.statut === "active" ? `déjà gérée (${contexte.copro.code})` : `ancienne copropriété (${contexte.copro.code})`) : null,
    contexte.autres.length > 0 ? `${contexte.autres.length} consultation${contexte.autres.length > 1 ? "s" : ""} précédente${contexte.autres.length > 1 ? "s" : ""}` : null,
  ].filter(Boolean);

  return (
    <AppShell user={g} active="propositions" breadcrumb={`Propositions · ${p.immeuble.adresse}`}>
      <Page largeur="travail">
        <PageHeader
          titre={p.immeuble.adresse}
          eyebrow={[p.immeuble.codePostal, p.immeuble.commune, p.agence ? `agence ${p.agence}` : null, p.gestionnaire].filter(Boolean).join(" · ")}
          badge={<Badge ton={p.statut === "elu" ? "ok" : p.statut.startsWith("refuse") ? "err" : p.statut === "accepte_cs" ? "warn" : "info"} size="md">{LIBELLE_STATUT[p.statut]}</Badge>}
          meta={meta.length > 0 ? meta.join(" · ") : undefined}
          actions={
            <>
              <ButtonLink href="/propositions" variant="secondary" size="sm"><ArrowLeft strokeWidth={1.5} /> Pipeline</ButtonLink>
              {STATUTS_OUVERTS.has(p.statut) && droits.offre && (
                <ButtonLink href={`/propositions/${p.id}/offre`} variant={p.statut === "accepte_cs" ? "secondary" : "primary"} size="sm" title={obstacles.length ? `Il manque : ${obstacles.join(", ")}` : undefined}>
                  <FileText strokeWidth={1.5} /> {p.remisePropositionISO ? "Revoir l'offre" : "Préparer l'offre"}
                </ButtonLink>
              )}
              {(p.statut === "accepte_cs" || p.statut === "elu") && !p.coproCode && droits.elire && (
                <ButtonLink href={`/propositions/${p.id}/election`} variant="primary" size="sm">
                  <Building2 strokeWidth={1.5} /> Élue : créer la copropriété
                </ButtonLink>
              )}
              {STATUTS_OUVERTS.has(p.statut) && !droits.offre && <span className="text-meta text-ink-3" title={MESSAGE_RESERVE_DIRECTION}>offre et élection : direction</span>}
            </>
          }
        />
        <FicheProposition proposition={p} prixGrille={prix} agences={agences.map((a) => a.code)} contexte={contexte} suggestion={suggestion} droits={{ completer: droits.completer, offre: droits.offre }} />
      </Page>
    </AppShell>
  );
}
