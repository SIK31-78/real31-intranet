import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link2, Plus, Search } from "lucide-react";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { peutCompleterProposition, peutVoirToutesLesPropositions, profilDe } from "@/lib/auth/roles";
import { etatRegistre, listerPropositions, type PropositionResume } from "@/lib/services/proposition/propositions";
import { LIBELLE_ORIGINE, LIBELLE_STATUT, STATUTS_OUVERTS, STATUTS_PROPOSITION, type StatutProposition } from "@/lib/domain/proposition/proposition";
import {
  filtrer,
  FENETRE_TRANSFORMATION_ANNEES,
  transformation,
  trier,
  type CleTri,
  type FiltrePipeline,
  type TriPipeline,
} from "@/lib/domain/proposition/pipeline";
import { formatJour } from "@/lib/services/facturation/format";
import { AppShell } from "@/components/layout/app-shell";
import { Page, PageHeader } from "@/components/ui/page";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Stat } from "@/components/ui/stat";
import { Rows, Row } from "@/components/ui/list-rows";
import { Table, Thead, Tbody, Th, Tr, Td, LienLigne } from "@/components/ui/table";

export const metadata: Metadata = { title: "Propositions de contrat - REAL31 Intranet" };
export const dynamic = "force-dynamic";

// Le pipeline commercial (ADR-039) : ce qui remplace l'Excel « Suivi Proposition reprise
// syndic ». Les filtres et le tri vivent dans l'URL (partageables) ; deux vues : la liste,
// et les colonnes par statut pour ce qui est ouvert.

const TON: Record<StatutProposition, "ok" | "warn" | "err" | "neutral" | "info"> = {
  en_cours: "info",
  accepte_cs: "warn",
  reporte: "neutral",
  elu: "ok",
  refuse_cs: "err",
  refuse_ag: "err",
  refuse_real31: "neutral",
};

const TRIS: { value: string; label: string }[] = [
  { value: "date-desc", label: "Les plus récentes" },
  { value: "date-asc", label: "Les plus anciennes" },
  { value: "maj-desc", label: "Dernière modification" },
  { value: "lots-desc", label: "Lots, du plus grand" },
  { value: "honoraires-desc", label: "Honoraires, du plus haut" },
  { value: "adresse-asc", label: "Adresse A → Z" },
];

type Params = { q?: string; statut?: string; tri?: string; vue?: string };

/** Les statuts proposes en boutons : ce qui est ouvert, tout, puis chaque issue. */
const STATUTS_BOUTONS: { value: NonNullable<FiltrePipeline["statut"]>; label: string }[] = [
  { value: "ouvertes", label: "Ouvertes" },
  { value: "toutes", label: "Toutes" },
  ...STATUTS_PROPOSITION.map((s) => ({ value: s, label: LIBELLE_STATUT[s] })),
];

function lireFiltre(sp: Params): FiltrePipeline {
  const statut = sp.statut && (sp.statut === "toutes" || (STATUTS_PROPOSITION as readonly string[]).includes(sp.statut)) ? (sp.statut as FiltrePipeline["statut"]) : "ouvertes";
  return { ...(sp.q?.trim() ? { texte: sp.q.trim() } : {}), statut };
}

function lireTri(sp: Params): TriPipeline {
  const [cle, sens] = (sp.tri ?? "date-desc").split("-");
  const cles: CleTri[] = ["date", "lots", "honoraires", "adresse", "maj"];
  return { cle: cles.includes(cle as CleTri) ? (cle as CleTri) : "date", sens: sens === "asc" ? "asc" : "desc" };
}

export default async function PropositionsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const g = await getGestionnaireCourant();
  if (!g) redirect("/dev-login");
  const sp = await searchParams;
  const filtre = lireFiltre(sp);
  const tri = lireTri(sp);
  const vue = sp.vue === "statut" ? "statut" : "liste";

  const profil = profilDe(g);
  const [chargees, registre] = await Promise.all([listerPropositions(), etatRegistre()]);
  // Hors syndic (vente, location, accueil) : le pipeline se limite aux contacts qu'on a notes.
  const toutes = peutVoirToutesLesPropositions(profil) ? chargees : chargees.filter((p) => p.creeParNom === g.nomComplet);
  const equipeSyndic = peutCompleterProposition(profil);
  const ouvertes = toutes.filter((p) => STATUTS_OUVERTS.has(p.statut));
  const lignes = trier(filtrer(toutes, filtre), tri) as PropositionResume[];
  // Les compteurs suivent les filtres (agence, annee, texte...) mais pas le statut : on
  // compte les en cours / acceptees / reportees DU PERIMETRE filtre, et la transformation
  // se calcule sur ses decisions.
  const perimetre = filtrer(toutes, { ...filtre, statut: "toutes" });
  const compte = (s: StatutProposition) => perimetre.filter((p) => p.statut === s).length;
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const transfo = transformation(perimetre, aujourdHui);
  // Le registre ne s'interroge pas ici (une requete par proposition) : le compte suffit.
  const aSuggestion = ouvertes.filter((p) => !p.immeuble.immatriculation).length;

  const lien = (maj: Partial<Params>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...maj })) if (v) q.set(k, v);
    return `/propositions?${q.toString()}`;
  };
  const lienVue = (v: "liste" | "statut") => lien({ vue: v === "statut" ? "statut" : undefined });
  const filtreActif = Boolean(filtre.texte || filtre.statut !== "ouvertes");

  return (
    <AppShell user={g} active="propositions" breadcrumb="Propositions de contrat">
      <Page largeur="travail">
        <PageHeader
          titre="Propositions de contrat de syndic"
          eyebrow={`${ouvertes.length} ouvertes · ${toutes.length} depuis 2012`}
          actions={
            <>
              {aSuggestion > 0 && equipeSyndic && (
                <ButtonLink href="/propositions/a-rapprocher" variant="secondary">
                  <Link2 strokeWidth={1.5} /> À rapprocher du registre ({aSuggestion})
                </ButtonLink>
              )}
              <ButtonLink href="/propositions/nouvelle" variant="primary">
                <Plus strokeWidth={1.5} /> Nouveau contact
              </ButtonLink>
            </>
          }
          aide={
            <p>
              Un appel, une visite, une offre : tout ce qui pourrait devenir une copropriété gérée. L&apos;adresse
              interroge le registre national des copropriétés (lots, syndic en place, fin de son mandat) ; le prix vient
              de la grille du cabinet et s&apos;ajuste librement — le client ne voit que le montant retenu. Le taux de
              transformation se mesure sur {FENETRE_TRANSFORMATION_ANNEES} ans glissants : au-delà, l&apos;historique Excel a été nettoyé (tout en refusé).
            </p>
          }
        />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="En cours" valeur={String(compte("en_cours"))} note={filtreActif ? "dans ce filtre" : undefined} />
          <Stat label="Acceptées par le CS" valeur={String(compte("accepte_cs"))} note="en attente de l'AG" />
          <Stat label="Reportées" valeur={String(compte("reporte"))} />
          <Stat
            label={`Transformation sur ${FENETRE_TRANSFORMATION_ANNEES} ans`}
            valeur={transfo.taux === null ? "—" : `${transfo.taux} %`}
            note={`${transfo.elues} élue${transfo.elues > 1 ? "s" : ""} sur ${transfo.decidees} décidée${transfo.decidees > 1 ? "s" : ""} depuis le ${formatJour(transfo.depuisISO)}`}
          />
        </div>

        <Card>
          <CardBody>
            <form method="get" action="/propositions" className="flex flex-col gap-3">
              {vue === "statut" && <input type="hidden" name="vue" value="statut" />}
              {filtre.statut !== "ouvertes" && <input type="hidden" name="statut" value={filtre.statut} />}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Field label="Rechercher" htmlFor="f-q" className="flex-1" hint="adresse, commune, contact, immatriculation, agence (LGC), gestionnaire, origine, année — plusieurs mots se cumulent">
                  <div className="flex items-center gap-2">
                    <Input id="f-q" name="q" defaultValue={filtre.texte ?? ""} placeholder="ex. « sartoris LGC 2026 » ou « bouche à oreille refusé »" autoComplete="off" />
                    <Button type="submit" variant="secondary" size="md"><Search strokeWidth={1.5} /> Chercher</Button>
                    {filtreActif && <ButtonLink href="/propositions" variant="ghost" size="md">Effacer</ButtonLink>}
                  </div>
                </Field>
                <Field label="Tri" htmlFor="f-tri" className="sm:w-56">
                  <Select id="f-tri" name="tri" defaultValue={`${tri.cle}-${tri.sens}`}>
                    {TRIS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1">
                  {STATUTS_BOUTONS.map((s) => (
                    <ButtonLink key={s.value} href={lien({ statut: s.value === "ouvertes" ? undefined : s.value })} variant={filtre.statut === s.value ? "secondary" : "ghost"} size="sm">
                      {s.label}
                    </ButtonLink>
                  ))}
                  <span className="text-caption text-ink-3 pl-2">{lignes.length} proposition{lignes.length > 1 ? "s" : ""}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={registre?.perime ? "text-caption text-warn-700" : "text-caption text-ink-3"}>
                    {registre
                      ? `Registre national : ${registre.nombre.toLocaleString("fr-FR")} copropriétés, chargé le ${formatJour(registre.chargeLeISO)}${registre.perime ? " — à rafraîchir (publication trimestrielle)" : ""}`
                      : "Registre national non chargé"}
                  </span>
                  <ButtonLink href={lienVue("liste")} variant={vue === "liste" ? "secondary" : "ghost"} size="sm">Liste</ButtonLink>
                  <ButtonLink href={lienVue("statut")} variant={vue === "statut" ? "secondary" : "ghost"} size="sm">Par statut</ButtonLink>
                </div>
              </div>
            </form>
          </CardBody>
        </Card>

        {lignes.length === 0 ? (
          <EmptyState>Aucune proposition ne correspond à ces filtres</EmptyState>
        ) : vue === "statut" ? (
          <VueParStatut lignes={lignes} />
        ) : (
          <>
            <TableProps lignes={lignes.slice(0, 200)} />
            {lignes.length > 200 && <p className="text-caption text-ink-3">Les 200 premières sont affichées — affinez les filtres pour voir le reste.</p>}
          </>
        )}
      </Page>
    </AppShell>
  );
}

function TableProps({ lignes }: { lignes: PropositionResume[] }) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>Immeuble</Th>
          <Th numeric>Lots</Th>
          <Th>Contact</Th>
          <Th>Agence</Th>
          <Th>Date</Th>
          <Th numeric>Honoraires TTC</Th>
          <Th numeric>Statut</Th>
        </tr>
      </Thead>
      <Tbody>
        {lignes.map((p) => (
          <Tr key={p.id} interactive>
            <Td principal>
              <LienLigne href={`/propositions/${p.id}`}>{p.immeuble.adresse}</LienLigne>
              <span className="block text-caption text-ink-3">
                {[p.immeuble.commune, p.immeuble.immatriculation].filter(Boolean).join(" · ") || "commune inconnue"}
                {STATUTS_OUVERTS.has(p.statut) && p.manquant.length > 0 && <span className="text-warn-700"> · manque {p.manquant.join(", ")}</span>}
              </span>
            </Td>
            <Td numeric className="tabular-nums">{p.immeuble.lotsPrincipaux ?? "—"}</Td>
            <Td secondaire>
              <span className="block text-ink truncate max-w-56">{p.contact.nom ?? "—"}</span>
              <span className="block text-caption text-ink-3 truncate max-w-56">{[p.contact.telephone, p.contact.email].filter(Boolean).join(" · ")}</span>
            </Td>
            <Td secondaire>
              {p.agence ?? "—"}
              {p.origine && <span className="block text-caption text-ink-3">{LIBELLE_ORIGINE[p.origine]}</span>}
            </Td>
            <Td secondaire className="tabular-nums">
              {p.premierContactISO ? formatJour(p.premierContactISO) : "—"}
              {p.decisionISO && !STATUTS_OUVERTS.has(p.statut) && <span className="block text-caption text-ink-3">décidé le {formatJour(p.decisionISO)}</span>}
            </Td>
            <Td numeric className="tabular-nums">{p.prix.honorairesTtc !== undefined ? `${p.prix.honorairesTtc.toLocaleString("fr-FR")} €` : "—"}</Td>
            <Td numeric><Badge ton={TON[p.statut]}>{LIBELLE_STATUT[p.statut]}</Badge></Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

/** Les colonnes par statut : ce qui est ouvert se lit d'un coup d'oeil. */
function VueParStatut({ lignes }: { lignes: PropositionResume[] }) {
  const statuts = STATUTS_PROPOSITION.filter((s) => lignes.some((p) => p.statut === s));
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {statuts.map((s) => {
        const groupe = lignes.filter((p) => p.statut === s);
        return (
          <div key={s} className="flex flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2">
              <Badge ton={TON[s]}>{LIBELLE_STATUT[s]}</Badge>
              <span className="text-caption text-ink-3">{groupe.length}</span>
            </div>
            <Rows>
              {groupe.slice(0, 60).map((p) => (
                <Row
                  key={p.id}
                  href={`/propositions/${p.id}`}
                  principal={p.immeuble.adresse}
                  secondaire={[p.immeuble.lotsPrincipaux !== undefined ? `${p.immeuble.lotsPrincipaux} lots` : null, p.contact.nom, p.agence].filter(Boolean).join(" · ")}
                  droite={<span className="text-caption text-ink-3 tabular-nums">{p.premierContactISO ? formatJour(p.premierContactISO) : "—"}</span>}
                />
              ))}
            </Rows>
            {groupe.length > 60 && <p className="text-caption text-ink-3">{groupe.length - 60} de plus — passez en liste.</p>}
          </div>
        );
      })}
    </div>
  );
}
