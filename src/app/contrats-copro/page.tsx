import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { lireVueChoisie } from "@/lib/auth/vue-perimetre";
import { vuesDisponibles } from "@/lib/services/coproprietes/vue-perimetre";
import { definirVueRequete, listerCoprosParRequete } from "@/lib/services/coproprietes/lister-copros-cache";
import { listerSuivis } from "@/lib/services/contrats-copro/lecture";
import { aCompleterPour } from "@/lib/services/contrats-copro/a-completer";
import { immeublesACompleter } from "@/lib/services/contrats-copro/immeuble";
import { jourParis } from "@/lib/services/date-du-jour";
import { SUJETS, type NiveauQualifie, type SujetSuivi } from "@/lib/domain/contrats-copro/types";
import { AppShell } from "@/components/layout/app-shell";
import { SelecteurVue } from "@/components/layout/selecteur-vue";
import { Page, PageHeader } from "@/components/ui/page";
import { ButtonLink } from "@/components/ui/button";
import { ListeSuivis } from "@/components/contrats-copro/liste-suivis";
import { ACompleterVue } from "@/components/contrats-copro/a-completer-vue";

export const metadata: Metadata = { title: "Contrats & contrôles - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// La liste consolidée du module « Contrats & contrôles » (REA-333, points 12, 15 et 16 du
// plan) : UN tableau des suivis en cours (assurance, gaz, CTQ ascenseur, CTQ VMC gaz) avec
// ses compteurs, et l'onglet « À compléter » qui liste ce qui manque pour que ces suivis
// tiennent debout. Le périmètre est celui de la vue choisie (ADR-041 : portefeuille, agence,
// cabinet), posée ici comme sur l'accueil ; l'onglet et les filtres vivent dans l'URL pour
// que l'accueil et un collègue puissent pointer dessus.

type Params = { onglet?: string; sujet?: string; niveau?: string; q?: string; rubrique?: string };

const NIVEAUX: readonly NiveauQualifie[] = ["rouge", "orange", "vert", "a_completer"];

function lireSujet(v?: string): SujetSuivi | undefined {
  return v && (SUJETS as readonly string[]).includes(v) ? (v as SujetSuivi) : undefined;
}

function lireNiveau(v?: string): NiveauQualifie | undefined {
  return v && (NIVEAUX as readonly string[]).includes(v) ? (v as NiveauQualifie) : undefined;
}

export default async function ContratsCoproPage({ searchParams }: { searchParams: Promise<Params> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const sp = await searchParams;
  const onglet = sp.onglet === "a-completer" ? "a-completer" : "suivis";
  const today = jourParis();

  // La vue (ADR-041) : portefeuille par défaut ; « Mon agence » ou « Le cabinet » si le rôle
  // ou une délégation l'ouvre. Posée une fois, listerCoprosParRequete la suit.
  const dispo = await vuesDisponibles(g.id, estSuperAdmin(g.email));
  const vue = await lireVueChoisie(dispo.vues);
  definirVueRequete(vue);
  const copros = await listerCoprosParRequete(g.id);
  // En vue cabinet, la liste complète passe quand même : le service écarte ce qui n'est pas
  // dedans (copro inactive, inconnue du référentiel).
  const coproCodes = copros.map((c) => c.code);

  // Un seul onglet se charge : « À compléter » interroge la cascade du conseil syndical
  // copro par copro, inutile de la payer quand on regarde les suivis.
  const [lignes, aCompleter, immeubles] =
    onglet === "suivis"
      ? [await listerSuivis({ coproCodes, aujourdhuiISO: today }), [], []]
      : [
          [],
          ...(await Promise.all([
            aCompleterPour({ coproCodes, aujourdhuiISO: today, verifierConseilSyndical: true }),
            immeublesACompleter({ coproCodes }).catch((err: Error) => {
              console.warn("[contrats-copro] fiches immeuble illisibles :", err.message);
              return [];
            }),
          ])),
        ];

  const eyebrow =
    onglet === "suivis"
      ? `${lignes.length} suivi${lignes.length > 1 ? "s" : ""} en cours · ${dispo.libelles[vue]}`
      : `${aCompleter.length} copropriété${aCompleter.length > 1 ? "s" : ""} à compléter · ${dispo.libelles[vue]}`;

  return (
    <AppShell user={g} active="contrats-copro" breadcrumb="Contrats & contrôles">
      <Page largeur="travail">
        <PageHeader
          titre="Contrats & contrôles"
          eyebrow={eyebrow}
          actions={<SelecteurVue vues={dispo.vues} libelles={dispo.libelles} active={vue} />}
          aide={
            <>
              <p>
                Quatre sujets sont suivis par copropriété : l&apos;assurance multirisque, le contrat de fourniture de gaz, le
                contrôle technique quinquennal de chaque ascenseur et celui de la VMC gaz. Chaque suivi est un cycle avec une
                échéance et des étapes datées ; dater la dernière étape clôt le cycle et ouvre le suivant.
              </p>
              <p>
                Le niveau dit si le dossier est figé, pas si l&apos;échéance est proche : vert tant qu&apos;une étape avance, orange
                puis rouge quand plus rien ne bouge dans la fenêtre de renouvellement. « À compléter » rassemble ce qui manque
                (échéance, compteurs, immatriculation, appareils) pour que les rappels puissent tourner.
              </p>
            </>
          }
        />

        <div role="group" aria-label="Onglets" className="inline-flex items-center gap-1 self-start">
          <ButtonLink href="/contrats-copro" variant={onglet === "suivis" ? "secondary" : "ghost"} size="sm" aria-current={onglet === "suivis" ? "page" : undefined}>
            Suivis
          </ButtonLink>
          <ButtonLink
            href="/contrats-copro?onglet=a-completer"
            variant={onglet === "a-completer" ? "secondary" : "ghost"}
            size="sm"
            aria-current={onglet === "a-completer" ? "page" : undefined}
          >
            À compléter
          </ButtonLink>
        </div>

        {onglet === "suivis" ? (
          <ListeSuivis
            lignes={lignes}
            initial={{
              ...(lireSujet(sp.sujet) ? { sujet: lireSujet(sp.sujet) } : {}),
              ...(lireNiveau(sp.niveau) ? { niveau: lireNiveau(sp.niveau) } : {}),
              ...(sp.q?.trim() ? { q: sp.q.trim() } : {}),
            }}
          />
        ) : (
          <ACompleterVue groupes={aCompleter} immeubles={immeubles} vue={vue} rubriqueInitiale={sp.rubrique} />
        )}
      </Page>
    </AppShell>
  );
}
