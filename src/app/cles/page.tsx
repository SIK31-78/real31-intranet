import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Plus, Store } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { jourParis } from "@/lib/services/date-du-jour";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { indexRecherche, tableauDeBord, trousseauxDeCopro } from "@/lib/services/cles/lecture";
import { formatDateLongue } from "@/lib/format-date";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Section } from "@/components/ui/section";
import { Stat } from "@/components/ui/stat";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";
import { Rows, Row } from "@/components/ui/list-rows";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RechercheComptoir } from "@/components/cles/recherche-comptoir";
import { LigneTrousseau } from "@/components/cles/ligne-trousseau";
import { ListeComptoir } from "@/components/cles/liste-comptoir";
import { estDirectionCles, peutOperer } from "@/lib/domain/cles/acteur";
import { ListeTrousseaux } from "@/components/cles/liste-trousseaux";
import { JournalTable } from "@/components/cles/journal-table";
import { LegendeArmoire, PlanArmoire } from "@/components/cles/plan-armoire";
import { libellePosition, occupationArmoire, positionTiroir } from "@/lib/domain/cles/armoire";

export const metadata: Metadata = { title: "Gestion des clés - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le comptoir (ADR-040) : une recherche en tete, puis ce qui demande un geste (retards,
// reservations du jour, conflits), puis l'etat de tous les trousseaux. Rien ne s'affiche
// quand une liste est vide (regle de l'accueil).

export default async function ClesPage({ searchParams }: { searchParams: Promise<{ copro?: string; tiroir?: string }> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const { copro, tiroir } = await searchParams;
  const aujourdhuiISO = jourParis();
  const acteur = await acteurCles(g);
  const [tb, index, deCopro] = await Promise.all([
    tableauDeBord(acteur.agence, aujourdhuiISO),
    indexRecherche(acteur.agence, aujourdhuiISO),
    copro ? trousseauxDeCopro(copro.toUpperCase(), aujourdhuiISO) : Promise.resolve([]),
  ]);
  const c = tb.compteurs;
  const armoire = occupationArmoire(tb.resumes.map((r) => ({ id: r.trousseau.id, numero: r.trousseau.numero, etat: r.etat, emplacement: r.trousseau.emplacement })));
  const posTiroir = positionTiroir(tiroir);
  const duTiroir = posTiroir ? tb.resumes.filter((r) => positionTiroir(r.trousseau.emplacement)?.code === posTiroir.code && r.etat !== "retire") : [];
  const aGerer = tb.enRetard.length + tb.reservationsDuJour.length + tb.conflits.length + tb.reservationsNonRetirees.length;

  return (
    <AppShell user={g} active="cles" breadcrumb="Gestion des clés">
      <Page largeur="travail">
        <PageHeader
          titre="Gestion des clés"
          eyebrow={acteur.agence ? `Agence ${acteur.agence} · ${formatDateLongue(aujourdhuiISO)}` : `Tout le cabinet · ${formatDateLongue(aujourdhuiISO)}`}
          actions={
            <span className="flex items-center gap-2">
              <ButtonLink href="/cles/entreprises" variant="secondary" size="sm"><Store strokeWidth={1.5} /> Entreprises</ButtonLink>
              <ButtonLink href="/cles/journal" variant="secondary" size="sm">Journal</ButtonLink>
              {acteur.agence && (
                <ButtonLink href="/cles/trousseaux/nouveau" variant="secondary" size="sm"><Plus strokeWidth={1.5} /> Nouveau trousseau</ButtonLink>
              )}
            </span>
          }
          aide={<p>Tape un numéro de trousseau, un nom de copropriété, une adresse ou une entreprise. Sur le trousseau : <strong>Sortir</strong>, <strong>Enregistrer le retour</strong>, <strong>Réserver</strong>. L&apos;état se déduit des prêts, il ne se modifie pas à la main.</p>}
        />

        <RechercheComptoir index={index} />

        {copro && (
          <Section id="cles-copro" titre={`Trousseaux de ${copro.toUpperCase()}`} compte={deCopro.length} actions={<ButtonLink href={`/copropriete/${encodeURIComponent(copro.toUpperCase())}`} variant="ghost" size="sm">Fiche copropriété <ArrowRight strokeWidth={1.5} /></ButtonLink>}>
            {deCopro.length === 0 ? <EmptyState>Aucun trousseau rattaché à cette copropriété</EmptyState> : <ListeComptoir resumes={deCopro} aujourdhuiISO={aujourdhuiISO} peutOperer={acteur.agence ? peutOperer(acteur, acteur.agence) : estDirectionCles(acteur)} direction={estDirectionCles(acteur, acteur.agence)} />}
          </Section>
        )}

        {posTiroir && (
          <Section id="cles-tiroir" titre={`Tiroir ${posTiroir.code}`} compte={duTiroir.length} actions={<ButtonLink href="/cles#cles-armoire" variant="ghost" size="sm">Toute l&apos;armoire</ButtonLink>}>
            <p className="text-body text-ink-2">{libellePosition(posTiroir).replace(/^c/, "C")}.</p>
            {duTiroir.length === 0 ? <EmptyState compact>Bac vide</EmptyState> : <ListeComptoir resumes={duTiroir} aujourdhuiISO={aujourdhuiISO} peutOperer={acteur.agence ? peutOperer(acteur, acteur.agence) : estDirectionCles(acteur)} direction={estDirectionCles(acteur, acteur.agence)} />}
          </Section>
        )}

        {c.total > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="En agence" valeur={c.enAgence} note={c.reserves > 0 ? `dont ${c.reserves} réservé${c.reserves > 1 ? "s" : ""}` : undefined} />
            <Stat label="Sortis" valeur={c.sortis} ton="warn" />
            <Stat label="En retard" valeur={c.enRetard} ton={c.enRetard > 0 ? "err" : "neutral"} note={c.enRetard > 0 ? "à relancer" : undefined} />
            <Stat label="Introuvables" valeur={c.introuvables} ton={c.introuvables > 0 ? "err" : "neutral"} />
          </div>
        )}

        {tb.conflits.length > 0 && (
          <Callout ton="warn" titre={`${tb.conflits.length} réservation${tb.conflits.length > 1 ? "s" : ""} sur un trousseau encore sorti`}>
            <ul className="flex flex-col gap-0.5">
              {tb.conflits.map((r) => (
                <li key={r.id}>
                  <span className="font-mono">{r.resume.trousseau.numero}</span> réservé le {formatDateLongue(r.debutISO)}{r.entrepriseNom ? ` par ${r.entrepriseNom}` : ""}, encore chez {r.resume.pret?.entrepriseNom ?? "une entreprise"} (retour prévu le {formatDateLongue(r.resume.pret?.retourPrevuLeISO ?? r.debutISO)})
                </li>
              ))}
            </ul>
          </Callout>
        )}

        {tb.reservationsDuJour.length > 0 && (
          <Section id="cles-jour" titre="Réservations du jour" compte={tb.reservationsDuJour.length}>
            <Rows>
              {tb.reservationsDuJour.map((r) => (
                <Row
                  key={r.id}
                  href={`/cles/trousseaux/${r.trousseauId}`}
                  avant={r.resume.trousseau.numero}
                  principal={r.entrepriseNom ?? "Entreprise ?"}
                  secondaire={<>{r.resume.biens.map((b) => b.libelle).join(", ")}{r.contact?.nom ? ` · ${r.contact.nom}` : ""}{r.motif ? ` · ${r.motif}` : ""} · retour prévu le {formatDateLongue(r.finPrevueISO)}</>}
                  droite={r.resume.pret ? <Badge ton="warn" dot>déjà sorti</Badge> : <Badge ton="info" dot>à remettre</Badge>}
                />
              ))}
            </Rows>
          </Section>
        )}

        {tb.reservationsNonRetirees.length > 0 && (
          <Section id="cles-non-retirees" titre="Réservées, jamais retirées" compte={tb.reservationsNonRetirees.length}>
            <Rows>
              {tb.reservationsNonRetirees.map((r) => (
                <Row key={r.id} href={`/cles/trousseaux/${r.trousseauId}`} ton="warn" avant={r.resume.trousseau.numero} principal={r.entrepriseNom ?? "Entreprise ?"} secondaire={<>prévu le {formatDateLongue(r.debutISO)}{r.motif ? ` · ${r.motif}` : ""}</>} droite={<Badge ton="warn">à sortir ou à annuler</Badge>} />
              ))}
            </Rows>
          </Section>
        )}

        {tb.enRetard.length > 0 && (
          <Section id="cles-retard" titre={<span className="flex items-center gap-2 text-err-700"><AlertTriangle strokeWidth={1.5} className="w-4 h-4" aria-hidden />En retard</span>} compte={tb.enRetard.length}>
            <Rows>{tb.enRetard.map((r) => <LigneTrousseau key={r.trousseau.id} resume={r} />)}</Rows>
          </Section>
        )}

        {tb.sortis.some((r) => r.etat !== "en_retard") && (
          <Section id="cles-sortis" titre="Sortis, dans les temps" compte={tb.sortis.filter((r) => r.etat !== "en_retard").length}>
            <Rows>{tb.sortis.filter((r) => r.etat !== "en_retard").map((r) => <LigneTrousseau key={r.trousseau.id} resume={r} />)}</Rows>
          </Section>
        )}

        {tb.reservationsAVenir.length > 0 && (
          <Section id="cles-a-venir" titre="Réservations à venir" compte={tb.reservationsAVenir.length}>
            <Rows>
              {tb.reservationsAVenir.map((r) => (
                <Row key={r.id} href={`/cles/trousseaux/${r.trousseauId}`} avant={r.resume.trousseau.numero} principal={r.entrepriseNom ?? "Entreprise ?"} secondaire={<>{formatDateLongue(r.debutISO)}{r.finPrevueISO !== r.debutISO ? ` jusqu'au ${formatDateLongue(r.finPrevueISO)}` : ""}{r.motif ? ` · ${r.motif}` : ""}</>} />
              ))}
            </Rows>
          </Section>
        )}

        {c.total > 0 && (
          <Section id="cles-armoire" titre="L'armoire" actions={<LegendeArmoire />}>
            <PlanArmoire bacs={armoire.bacs} surligne={posTiroir?.code} />
            {armoire.horsArmoire.length > 0 && (
              <p className="text-meta text-ink-2">
                Hors armoire ou sans tiroir : {armoire.horsArmoire.map((t) => t.numero).join(", ")}.
              </p>
            )}
          </Section>
        )}

        <Section id="cles-tous" titre="Tous les trousseaux" compte={c.total}>
          {tb.resumes.length === 0 ? (
            <EmptyState action={acteur.agence ? <ButtonLink href="/cles/trousseaux/nouveau" variant="secondary" size="sm"><Plus strokeWidth={1.5} /> Créer le premier trousseau</ButtonLink> : undefined}>
              Aucun trousseau {acteur.agence ? `pour l'agence ${acteur.agence}` : ""}
            </EmptyState>
          ) : (
            <ListeTrousseaux resumes={tb.resumes} />
          )}
        </Section>

        {tb.recents.length > 0 && (
          <Section id="cles-recents" titre="Derniers mouvements" actions={<ButtonLink href="/cles/journal" variant="ghost" size="sm">Tout le journal <ArrowRight strokeWidth={1.5} /></ButtonLink>}>
            <JournalTable lignes={tb.recents} />
          </Section>
        )}

        {aGerer === 0 && c.total > 0 && <p className="text-meta text-ink-3">Rien ne presse : aucun retard, aucune réservation du jour.</p>}
      </Page>
    </AppShell>
  );
}
