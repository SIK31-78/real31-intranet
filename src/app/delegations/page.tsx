import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { estSuperAdmin } from "@/lib/auth/roles";
import { ecranDelegations } from "@/lib/services/delegations/delegations";
import { niveauEcriture } from "@/lib/domain/perimetre-ecriture";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Rows, Row } from "@/components/ui/list-rows";
import { FormulaireDelegation } from "./formulaire-delegation";
import { RetirerDelegation } from "./retirer-delegation";

export const metadata: Metadata = { title: "Délégations - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Les delegations d'ecriture (ADR-041) : qui remplace qui, sur quoi, jusqu'a quand. Ouverte
// a tout le cabinet : chacun voit les siennes (donnees ou recues) et peut deleguer son
// propre portefeuille ; la direction voit et pose celles de son agence.

const LIBELLE_PORTEE = { portefeuille: "le portefeuille", agence: "l'agence", copro: "la copropriété" } as const;

export default async function DelegationsPage() {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const ecran = await ecranDelegations(g.id, estSuperAdmin(g.email));
  if (!ecran) redirect("/accueil");
  const niveau = niveauEcriture(ecran.auteur);
  const actives = ecran.delegations.filter((d) => d.etat !== "passee");
  const passees = ecran.delegations.filter((d) => d.etat === "passee");

  return (
    <AppShell user={g} active="collaborateurs" breadcrumb="Délégations">
      <Page largeur="travail">
        <PageHeader
          titre="Délégations"
          eyebrow={niveau === "cabinet" ? "Tout le cabinet" : niveau === "agence" ? `Votre agence (${ecran.agences.filter((a) => ecran.auteur.agenceCode === a).join(", ") || ecran.auteur.agenceCode})` : "Votre portefeuille"}
          aide={
            <p>
              Une délégation donne à quelqu&apos;un le droit d&apos;écrire sur les copropriétés d&apos;un autre : dates, ODJ, récap AG, contrat,
              facturation, tout ce que le titulaire ferait. Elle a un début, une fin et un motif, et se retire à tout moment. Un
              congé, un binôme, un remplacement : on la pose ici, elle expire toute seule.
            </p>
          }
        />

        <Section id="del-nouvelle" titre="Nouvelle délégation">
          <Card>
            <CardBody>
              <FormulaireDelegation
                moi={g.id}
                collaborateurs={ecran.collaborateurs}
                titulairesPossibles={ecran.titulairesPossibles}
                agences={ecran.agences}
                peutDeleguerAgence={niveau !== "portefeuille"}
              />
            </CardBody>
          </Card>
        </Section>

        <Section id="del-en-cours" titre="En cours et à venir" compte={actives.length}>
          {actives.length === 0 ? (
            <EmptyState>Aucune délégation en cours.</EmptyState>
          ) : (
            <Rows>
              {actives.map((d) => (
                <Row
                  key={d.id}
                  avant={<Badge ton={d.etat === "active" ? "ok" : "neutral"} dot>{d.etat === "active" ? "active" : "à venir"}</Badge>}
                  principal={`${d.de.nomComplet} → ${d.a.nomComplet}`}
                  secondaire={`sur ${LIBELLE_PORTEE[d.portee]}${d.portee === "agence" ? ` ${d.agenceCode}` : d.portee === "copro" ? ` ${d.coproCode}` : ""} · du ${formatJour(d.depuisISO)}${d.jusquaISO ? ` au ${formatJour(d.jusquaISO)}` : ", sans fin"}${d.motif ? ` · ${d.motif}` : ""}`}
                  droite={d.retirable ? <RetirerDelegation id={d.id} /> : undefined}
                />
              ))}
            </Rows>
          )}
        </Section>

        {passees.length > 0 && (
          <Section id="del-passees" titre="Terminées" compte={passees.length}>
            <Rows>
              {passees.map((d) => (
                <Row
                  key={d.id}
                  avant={<Badge ton="neutral">terminée</Badge>}
                  principal={`${d.de.nomComplet} → ${d.a.nomComplet}`}
                  secondaire={`du ${formatJour(d.depuisISO)} au ${formatJour(d.jusquaISO ?? "")}${d.motif ? ` · ${d.motif}` : ""}`}
                />
              ))}
            </Rows>
          </Section>
        )}
      </Page>
    </AppShell>
  );
}
