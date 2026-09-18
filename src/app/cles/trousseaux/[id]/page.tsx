import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { jourParis } from "@/lib/services/date-du-jour";
import { acteurCles } from "@/lib/auth/acteur-cles";
import { estDirectionCles, peutOperer } from "@/lib/domain/cles/acteur";
import { ficheTrousseau } from "@/lib/services/cles/lecture";
import { coprosPourCles } from "@/lib/services/cles/copros-choix";
import { LIBELLE_CONFORMITE, LIBELLE_TYPE_ACCES, LIBELLE_TYPE_ELEMENT } from "@/lib/domain/cles/types";
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
import { PastilleEtat, detailEtat } from "@/components/cles/pastille-etat";
import { EnTeteTrousseau } from "@/components/cles/en-tete-trousseau";
import { JournalTable } from "@/components/cles/journal-table";
import { CorrectionPret } from "@/components/cles/correction-pret";

export const metadata: Metadata = { title: "Trousseau - REAL31 Intranet" };
export const dynamic = "force-dynamic";

export default async function TrousseauPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const aujourdhuiISO = jourParis();
  const [acteur, fiche, copros] = await Promise.all([acteurCles(g), ficheTrousseau(id, aujourdhuiISO), coprosPourCles()]);
  if (!fiche) notFound();
  const { resume, prets, reservations, mouvements, photoUrl } = fiche;
  const t = resume.trousseau;
  const operable = peutOperer(acteur, t.agenceCode);
  const direction = estDirectionCles(acteur, t.agenceCode);
  const pret = resume.pret;

  return (
    <AppShell user={g} active="cles" breadcrumb={`Gestion des clés · ${t.numero}`}>
      <Page largeur="travail">
        <PageHeader
          titre={<span className="flex items-center gap-3 flex-wrap"><span className="font-mono">{t.numero}</span><span className="font-normal text-ink-2">{t.libelle}</span></span>}
          eyebrow={`Agence ${t.agenceCode}${t.emplacement ? ` · ${t.emplacement}` : ""}`}
          badge={<PastilleEtat etat={resume.etat} size="md" detail={detailEtat({ etat: resume.etat, entrepriseNom: pret?.entrepriseNom, joursDehors: resume.joursDehors, joursRetard: resume.joursRetard, type: pret?.type, contactNom: pret?.contact?.nom })} />}
          actions={
            <span className="flex items-center gap-2 flex-wrap justify-end">
              <EnTeteTrousseau trousseau={t} etat={resume.etat} pret={pret} reservations={resume.reservations} aujourdhuiISO={aujourdhuiISO} peutOperer={operable} direction={direction} copros={copros} />
              <ButtonLink href="/cles" variant="ghost" size="sm"><ArrowLeft strokeWidth={1.5} /> Comptoir</ButtonLink>
            </span>
          }
        />

        {!operable && <Callout ton="info">Ce trousseau appartient à l&apos;agence {t.agenceCode} : lecture seule.</Callout>}

        {pret && (
          <Callout ton={resume.etat === "en_retard" ? "err" : "warn"} titre={resume.etat === "en_retard" ? `En retard de ${resume.joursRetard} jour${resume.joursRetard > 1 ? "s" : ""}` : "Sorti"}>
            {pret.type === "interne" ? "Usage interne" : pret.entrepriseId ? <Link href={`/cles/entreprises/${pret.entrepriseId}`} className="font-medium underline-offset-2 hover:underline">{pret.entrepriseNom}</Link> : "Entreprise inconnue"}
            {pret.contact?.nom ? ` · ${pret.contact.nom}${pret.contact.telephone ? ` (${pret.contact.telephone})` : ""}` : ""}
            {" · "}sorti le {formatDateLongue(pret.sortiLeISO.slice(0, 10))} par {pret.sortiParNom} · retour prévu le {formatDateLongue(pret.retourPrevuLeISO)}
            {pret.motif ? ` · ${pret.motif}` : ""}
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <Section id="tr-acces" titre="Ce qu'il ouvre" compte={t.acces.length}>
              <Rows>
                {t.acces.map((a) => (
                  <Row
                    key={a.id}
                    href={a.bien.type === "copro" ? `/copropriete/${encodeURIComponent(a.bien.code)}` : undefined}
                    avant={a.bien.type === "copro" ? a.bien.code : a.bien.ref}
                    principal={resume.biens.find((b) => b.bien === a.bien)?.libelle ?? (a.bien.type === "copro" ? a.bien.code : a.bien.ref)}
                    secondaire={<>{resume.biens.find((b) => b.bien === a.bien)?.adresse}{a.immeuble ? ` · ${a.immeuble}` : ""}{a.libelle ? ` · ${a.libelle}` : ""}</>}
                    droite={<span className="flex gap-1 flex-wrap justify-end">{a.types.map((ty) => <Badge key={ty} ton="outline">{LIBELLE_TYPE_ACCES[ty]}</Badge>)}</span>}
                  />
                ))}
              </Rows>
            </Section>

            {resume.reservations.length > 0 && (
              <Section id="tr-resas" titre="Réservations à venir" compte={resume.reservations.length}>
                <Rows>
                  {resume.reservations.map((r) => (
                    <Row key={r.id} avant={formatDateLongue(r.debutISO)} principal={r.entrepriseNom ?? "?"} secondaire={<>{r.finPrevueISO !== r.debutISO ? `jusqu'au ${formatDateLongue(r.finPrevueISO)} · ` : ""}{r.contact?.nom ? `${r.contact.nom} · ` : ""}{r.motif ?? ""} · par {r.creeParNom}</>} droite={<Badge ton="info" dot>prévue</Badge>} />
                  ))}
                </Rows>
              </Section>
            )}

            <Section id="tr-prets" titre="Prêts" compte={prets.length}>
              {prets.length === 0 ? <p className="text-body text-ink-3">Jamais sorti.</p> : (
                <Rows>
                  {prets.map((p) => {
                    const clos = Boolean(p.renduLeISO);
                    const jours = joursDehors(p, aujourdhuiISO);
                    const tardif = clos && (p.renduLeISO ?? "").slice(0, 10) > p.retourPrevuLeISO;
                    return (
                      <Row
                        key={p.id}
                        avant={formatDateLongue(p.sortiLeISO.slice(0, 10))}
                        principal={p.type === "interne" ? `Interne${p.contact?.nom ? ` · ${p.contact.nom}` : ""}` : p.entrepriseNom ?? "?"}
                        secondaire={<>{clos ? `rendu le ${formatDateLongue(p.renduLeISO!.slice(0, 10))} (${libelleDuree(jours)})` : `retour prévu le ${formatDateLongue(p.retourPrevuLeISO)}`}{p.motif ? ` · ${p.motif}` : ""}{p.commentaireRetour ? ` · ${p.commentaireRetour}` : ""}</>}
                        droite={
                          <span className="flex items-center gap-2">
                            {clos ? <Badge ton={p.retourConforme === "complet" || !p.retourConforme ? "ok" : "err"}>{p.retourConforme ? LIBELLE_CONFORMITE[p.retourConforme] : "rendu"}</Badge> : <Badge ton="warn" dot>ouvert</Badge>}
                            {tardif && <Badge ton="err">rendu en retard</Badge>}
                            {direction && <CorrectionPret pret={p} />}
                          </span>
                        }
                      />
                    );
                  })}
                </Rows>
              )}
            </Section>

            {reservations.some((r) => r.statut !== "prevue") && (
              <Section id="tr-resas-passees" titre="Réservations passées" compte={reservations.filter((r) => r.statut !== "prevue").length}>
                <Rows>
                  {reservations.filter((r) => r.statut !== "prevue").map((r) => (
                    <Row key={r.id} avant={formatDateLongue(r.debutISO)} principal={r.entrepriseNom ?? "?"} secondaire={r.statut === "annulee" ? `annulée${r.annuleePar ? ` par ${r.annuleePar}` : ""}${r.motifAnnulation ? ` — ${r.motifAnnulation}` : ""}` : "convertie en prêt"} droite={<Badge ton={r.statut === "annulee" ? "neutral" : "ok"}>{r.statut === "annulee" ? "annulée" : "sortie"}</Badge>} />
                  ))}
                </Rows>
              </Section>
            )}

            <Section id="tr-journal" titre="Journal" compte={mouvements.length}>
              <JournalTable lignes={mouvements} avecTrousseau={false} />
            </Section>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardBody>
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt={`Photo du trousseau ${t.numero}`} className="w-full rounded-md object-cover max-h-64" />
                ) : (
                  <p className="text-meta text-ink-3">Pas de photo.</p>
                )}
                <DataList align="left" className="mt-3">
                  <DataRow label="Composition">
                    {t.composition.length === 0 ? <span className="text-ink-3">non renseignée</span> : t.composition.map((e) => `${e.quantite} ${LIBELLE_TYPE_ELEMENT[e.type]}${e.quantite > 1 ? "s" : ""}${e.libelle ? ` (${e.libelle})` : ""}`).join(", ")}
                  </DataRow>
                  {t.emplacement && <DataRow label="Emplacement">{t.emplacement}</DataRow>}
                  {t.note && <DataRow label="Note">{t.note}</DataRow>}
                  <DataRow label="Créé">{formatDateLongue(t.creeLeISO.slice(0, 10))} · {t.creeParNom}</DataRow>
                  {t.source === "import_powerapps" && <DataRow label="Origine">repris de PowerApps</DataRow>}
                </DataList>
              </CardBody>
            </Card>
          </div>
        </div>
      </Page>
    </AppShell>
  );
}
