"use client";

// La fiche d'une proposition, en deux colonnes : a gauche ce qu'on travaille (le prix, la
// fiche de visite, le journal) ; a droite ce qu'on suit (statut, contact, l'immeuble au
// registre et son historique). Chaque bloc s'enregistre seul.

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Save } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea, Choix } from "@/components/ui/field";
import { Section } from "@/components/ui/section";
import { DataList, DataRow } from "@/components/ui/data-list";
import { useToast } from "@/components/ui/toast";
import { formatDateLongue } from "@/lib/format-date";
import { formatJour } from "@/lib/services/facturation/format";
import { ecartGrille } from "@/lib/domain/proposition/forfait";
import {
  informationsManquantes,
  LIBELLE_ORIGINE,
  LIBELLE_STATUT,
  libellePeriodeConstruction,
  ORIGINES,
  STATUTS_OUVERTS,
  STATUTS_PROPOSITION,
  type Immeuble,
  type Origine,
  type Proposition,
  type StatutProposition,
} from "@/lib/domain/proposition/proposition";
import type { ContexteImmeuble, PrixCalcule, SuggestionRapprochement } from "@/lib/services/proposition/propositions";
import { DetacherRegistre, RattacherRegistre } from "@/components/proposition/rattacher-registre";
import { calculerPrixAction, mettreAJourPropositionAction } from "../actions";

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const nb = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
const txt = (v: number | undefined) => (v === undefined ? "" : String(v));

const TON: Record<StatutProposition, "ok" | "warn" | "err" | "neutral" | "info"> = {
  en_cours: "info",
  accepte_cs: "warn",
  reporte: "neutral",
  elu: "ok",
  refuse_cs: "err",
  refuse_ag: "err",
  refuse_real31: "neutral",
};

function BlocLateral({ titre, children, actions }: { titre: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-body font-medium text-ink">{titre}</h2>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function FicheProposition({
  proposition: p,
  prixGrille,
  agences,
  contexte,
  suggestion,
}: {
  proposition: Proposition;
  prixGrille: PrixCalcule;
  agences: string[];
  contexte: ContexteImmeuble;
  suggestion?: SuggestionRapprochement;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();

  // --- Immeuble ---
  const [im, setIm] = useState<Immeuble>(p.immeuble);
  const champ = <K extends keyof Immeuble>(k: K, v: Immeuble[K]) => setIm((i) => ({ ...i, [k]: v }));
  const [prix, setPrix] = useState(prixGrille);
  // --- Contact ---
  const [contact, setContact] = useState(p.contact);
  // --- Prix retenu ---
  const [honoraires, setHonoraires] = useState(txt(p.prix.honorairesTtc ?? (prixGrille.grilleDisponible ? prixGrille.forfait.grilleTtc : undefined)));
  const [timbres, setTimbres] = useState(txt(p.prix.timbresTtc ?? (prixGrille.grilleDisponible ? prixGrille.forfait.timbresTtc : undefined)));
  const [reels, setReels] = useState(p.prix.fraisPostauxReels ?? false);
  // --- Suivi ---
  const [statut, setStatut] = useState<StatutProposition>(p.statut);
  const [agence, setAgence] = useState(p.agence ?? "");
  const [gestionnaire, setGestionnaire] = useState(p.gestionnaire ?? "");
  const [origine, setOrigine] = useState<Origine | "">(p.origine ?? "");
  const [remise, setRemise] = useState(p.remisePropositionISO ?? "");
  const [agPrevue, setAgPrevue] = useState(p.agPrevueISO ?? "");
  const [commentaires, setCommentaires] = useState(p.commentaires ?? "");
  const [note, setNote] = useState("");

  function enregistrer(maj: Record<string, unknown>, message: string) {
    demarrer(async () => {
      const res = await mettreAJourPropositionAction({ id: p.id, ...maj });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(message);
      router.refresh();
    });
  }

  function recalculer() {
    demarrer(async () => {
      const res = await calculerPrixAction(im);
      if (!res.ok || !res.donnees) return toast.err(res.ok ? "Calcul impossible." : res.erreur);
      setPrix(res.donnees);
      if (res.donnees.grilleDisponible) {
        setHonoraires(txt(res.donnees.forfait.grilleTtc));
        setTimbres(txt(res.donnees.forfait.timbresTtc));
      }
    });
  }

  const hono = nb(honoraires);
  const ecart = hono !== undefined && prix.grilleDisponible ? ecartGrille(hono, prix.forfait.grilleTtc) : null;
  const manquant = informationsManquantes({ immeuble: im, contact });
  const num = (id: string, label: string, k: keyof Immeuble, placeholder?: string) => (
    <Field label={label} htmlFor={id}>
      <Input id={id} inputMode="numeric" value={txt(im[k] as number | undefined)} onChange={(e) => champ(k, nb(e.target.value) as never)} placeholder={placeholder} className="tabular-nums" />
    </Field>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
      {/* ---- Colonne principale ---- */}
      <div className="flex flex-col gap-5 min-w-0">
        {manquant.length > 0 && STATUTS_OUVERTS.has(p.statut) && (
          <Callout ton="warn">Pour faire l&apos;offre, il manque encore : {manquant.join(", ")}.</Callout>
        )}

        <Section id="prop-prix" titre="Le prix" actions={<Button type="button" variant="ghost" size="sm" disabled={pending} onClick={recalculer}>Recalculer depuis l&apos;immeuble</Button>}>
          <Card>
            <CardBody className="flex flex-col gap-4">
              {prix.grilleDisponible ? (
                <DataList align="left">
                  {prix.forfait.details.map((d) => (
                    <DataRow key={d.ligne} label={d.libelle}>
                      <span className="tabular-nums">{d.quantite > 1 ? `${d.quantite} × ${euros(d.unitaireTtc)} = ` : ""}{euros(d.montantTtc)}</span>
                    </DataRow>
                  ))}
                  <DataRow label={`Grille ${prix.annee}`}>
                    <span className="font-medium tabular-nums">{euros(prix.forfait.grilleTtc)} TTC</span>
                    <span className="text-ink-3"> ({euros(prix.forfait.grilleHt)} HT)</span>
                  </DataRow>
                </DataList>
              ) : (
                <p className="text-body text-warn-700">La grille du forfait {prix.annee} n&apos;est pas dans le barème : le prix se saisit à la main.</p>
              )}
              <div className="flex flex-wrap items-end gap-4 border-t border-line pt-4">
                <Field label="Honoraires retenus (TTC)" htmlFor="pp-hono"><Input id="pp-hono" inputMode="decimal" value={honoraires} onChange={(e) => setHonoraires(e.target.value)} largeur="auto" className="tabular-nums" /></Field>
                <div className="flex items-end pb-2 gap-3">
                  <Choix type="radio" name="pp-frais" label="Forfait timbres" checked={!reels} onChange={() => setReels(false)} />
                  <Choix type="radio" name="pp-frais" label="Frais réels" checked={reels} onChange={() => setReels(true)} />
                </div>
                {!reels && <Field label="Forfait timbres (TTC)" htmlFor="pp-timbres"><Input id="pp-timbres" inputMode="decimal" value={timbres} onChange={(e) => setTimbres(e.target.value)} largeur="auto" className="tabular-nums" /></Field>}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={pending || hono === undefined}
                  onClick={() =>
                    enregistrer(
                      {
                        prix: {
                          honorairesTtc: hono,
                          timbresTtc: reels ? 0 : nb(timbres),
                          fraisPostauxReels: reels,
                          ...(prix.grilleDisponible ? { grilleTtc: prix.forfait.grilleTtc, grilleTimbresTtc: prix.forfait.timbresTtc, anneeGrille: prix.annee } : {}),
                        },
                      },
                      "Prix enregistré.",
                    )
                  }
                >
                  <Save strokeWidth={1.5} /> Enregistrer le prix
                </Button>
                {ecart !== null && ecart !== 0 && (
                  <p className="text-caption text-ink-2 basis-full">
                    {ecart < 0 ? "Remise" : "Majoration"} de <span className="font-medium tabular-nums">{Math.abs(ecart).toLocaleString("fr-FR")} %</span> par rapport à la grille — trace interne, le client ne la voit pas.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </Section>

        <Section
          id="prop-immeuble"
          titre="L'immeuble"
          actions={
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => enregistrer({ immeuble: im }, "Immeuble enregistré.")}>
              <Save strokeWidth={1.5} /> Enregistrer
            </Button>
          }
        >
          <Card>
            <CardBody className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <Field label="Adresse" htmlFor="pi-adresse" className="col-span-2 sm:col-span-4"><Input id="pi-adresse" value={im.adresse} onChange={(e) => champ("adresse", e.target.value)} /></Field>
                <Field label="Code postal" htmlFor="pi-cp"><Input id="pi-cp" value={im.codePostal ?? ""} onChange={(e) => champ("codePostal", e.target.value)} /></Field>
                <Field label="Commune" htmlFor="pi-commune"><Input id="pi-commune" value={im.commune ?? ""} onChange={(e) => champ("commune", e.target.value)} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                {num("pi-lots", "Lots principaux", "lotsPrincipaux")}
                {num("pi-copros", "Copropriétaires", "coproprietaires")}
                <Field label="Syndic actuel" htmlFor="pi-syndic" className="col-span-2"><Input id="pi-syndic" value={im.syndicActuel ?? ""} onChange={(e) => champ("syndicActuel", e.target.value)} /></Field>
                <Field label="Fin de son mandat" htmlFor="pi-finmandat"><Input id="pi-finmandat" type="date" value={im.finMandatActuelISO ?? ""} onChange={(e) => champ("finMandatActuelISO", e.target.value || undefined)} /></Field>
                <Field label="Prochaine AG" htmlFor="pi-ag"><Input id="pi-ag" type="date" value={im.prochaineAgISO ?? ""} onChange={(e) => champ("prochaineAgISO", e.target.value || undefined)} /></Field>
              </div>
              <details className="group">
                <summary className="cursor-pointer text-body text-ink-2 hover:text-ink select-none">Fiche de visite : équipements, clôture, litiges, notes</summary>
                <div className="flex flex-col gap-3 pt-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                    {num("pi-cages", "Cages d'escalier", "cagesEscalier")}
                    {num("pi-asc", "Ascenseurs", "ascenseurs")}
                    {num("pi-portes", "Portes de parking", "portesGarage")}
                    {num("pi-gardiens", "Gardiens", "gardiens")}
                    {num("pi-emp", "Employés d'immeuble", "employesImmeuble")}
                    <Field label="Ménage" htmlFor="pi-menage"><Input id="pi-menage" value={im.menage ?? ""} onChange={(e) => champ("menage", e.target.value)} placeholder="société / employé" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                    <div className="flex items-end pb-2 col-span-2">
                      <Choix type="checkbox" label="Chauffage collectif" checked={im.chauffageCollectif ?? false} onChange={(e) => champ("chauffageCollectif", e.target.checked)} />
                    </div>
                    {num("pi-visites", "Visites prévues", "visitesPrevues", "1")}
                    {num("pi-cs", "CS complémentaires", "csPrevus")}
                    <Field label="Clôture comptable" htmlFor="pi-cloture" className="col-span-2"><Input id="pi-cloture" value={im.clotureComptable ?? ""} onChange={(e) => champ("clotureComptable", e.target.value)} placeholder="31/12" /></Field>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Litiges / procédures" htmlFor="pi-litiges"><Textarea id="pi-litiges" rows={2} value={im.litiges ?? ""} onChange={(e) => champ("litiges", e.target.value)} /></Field>
                    <Field label="Notes de visite" htmlFor="pi-notes"><Textarea id="pi-notes" rows={2} value={im.notes ?? ""} onChange={(e) => champ("notes", e.target.value)} /></Field>
                  </div>
                </div>
              </details>
            </CardBody>
          </Card>
        </Section>

        {p.journal.length > 0 && (
          <Section id="prop-journal" titre="Journal" compte={p.journal.length}>
            <Card>
              <CardBody>
                <ul className="flex flex-col gap-1.5 text-body">
                  {[...p.journal].reverse().map((j, i) => (
                    <li key={i} className="grid grid-cols-[7.5rem_1fr] gap-3 sm:grid-cols-[7.5rem_10rem_1fr]">
                      <span className="text-ink-3 tabular-nums">{formatDateLongue(j.quandISO.slice(0, 10))}</span>
                      <span className="text-ink-2 truncate hidden sm:block">{j.par}</span>
                      <span className="min-w-0">{j.texte}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </Section>
        )}
        <p className="text-caption text-ink-3">Créée le {formatDateLongue(p.creeLeISO)} par {p.creeParNom}{p.premierContactISO && ` · premier contact le ${formatJour(p.premierContactISO)}`}</p>
      </div>

      {/* ---- Colonne laterale : UNE carte, des blocs separes par une hairline ---- */}
      <Card>
        <div className="divide-y divide-line">
          <BlocLateral
            titre="Le suivi"
            actions={
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  enregistrer(
                    { statut, agence: agence || null, gestionnaire: gestionnaire || null, origine: origine || null, remisePropositionISO: remise || null, agPrevueISO: agPrevue || null, commentaires: commentaires || null, ...(note.trim() ? { note } : {}) },
                    "Suivi enregistré.",
                  );
                  setNote("");
                }}
              >
                {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Save strokeWidth={1.5} />} Enregistrer
              </Button>
            }
          >
            <Field label="Statut" htmlFor="ps-statut">
              <Select id="ps-statut" value={statut} onChange={(e) => setStatut(e.target.value as StatutProposition)}>
                {STATUTS_PROPOSITION.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Agence" htmlFor="ps-agence">
                <Select id="ps-agence" value={agence} onChange={(e) => setAgence(e.target.value)}>
                  <option value="">—</option>
                  {agences.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </Field>
              <Field label="Origine" htmlFor="ps-origine">
                <Select id="ps-origine" value={origine} onChange={(e) => setOrigine(e.target.value as Origine | "")}>
                  <option value="">—</option>
                  {ORIGINES.map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE[o]}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Gestionnaire" htmlFor="ps-gest"><Input id="ps-gest" value={gestionnaire} onChange={(e) => setGestionnaire(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Proposition remise le" htmlFor="ps-remise"><Input id="ps-remise" type="date" value={remise} onChange={(e) => setRemise(e.target.value)} /></Field>
              <Field label="AG prévue le" htmlFor="ps-ag"><Input id="ps-ag" type="date" value={agPrevue} onChange={(e) => setAgPrevue(e.target.value)} /></Field>
            </div>
            <Field label="Commentaires" htmlFor="ps-comm"><Textarea id="ps-comm" rows={2} value={commentaires} onChange={(e) => setCommentaires(e.target.value)} /></Field>
            <Field label="Ajouter au journal" htmlFor="ps-note"><Input id="ps-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rappelé le CS, visite prévue le…" /></Field>
            {p.decisionISO && <p className="text-caption text-ink-3">Décision le {formatJour(p.decisionISO)}{p.coproCode && ` · copropriété ${p.coproCode}`}</p>}
          </BlocLateral>

          <BlocLateral
            titre="Le contact"
            actions={
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => enregistrer({ contact }, "Contact enregistré.")}>
                <Save strokeWidth={1.5} /> Enregistrer
              </Button>
            }
          >
            <Field label="Nom" htmlFor="pc-nom"><Input id="pc-nom" value={contact.nom ?? ""} onChange={(e) => setContact({ ...contact, nom: e.target.value })} /></Field>
            <Field label="Rôle" htmlFor="pc-role"><Input id="pc-role" value={contact.role ?? ""} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="président du CS, copropriétaire…" /></Field>
            <Field label="Téléphone" htmlFor="pc-tel"><Input id="pc-tel" value={contact.telephone ?? ""} onChange={(e) => setContact({ ...contact, telephone: e.target.value })} /></Field>
            <Field label="E-mail" htmlFor="pc-email"><Input id="pc-email" value={contact.email ?? ""} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
          </BlocLateral>

          <BlocLateral titre="Cet immeuble" actions={p.immeuble.immatriculation ? <DetacherRegistre propositionId={p.id} /> : undefined}>
            {p.immeuble.immatriculation ? (
              <>
                <p className="text-caption text-ink-2">
                  Registre national : <span className="font-mono">{p.immeuble.immatriculation}</span>
                  {p.immeuble.periodeConstruction && ` · construit ${libellePeriodeConstruction(p.immeuble.periodeConstruction)}`}
                </p>
                {contexte.copro ? (
                  <Link href={`/copros/${contexte.copro.code}`} className="flex items-start gap-2 rounded-md border border-line p-3 hover:bg-surface-2">
                    <Building2 strokeWidth={1.5} className="h-4 w-4 mt-0.5 shrink-0 text-ink-2" />
                    <span className="min-w-0 flex flex-col">
                      <span className="text-body text-ink"><span className="font-mono text-ink-2">{contexte.copro.code}</span> {contexte.copro.nom}</span>
                      <span className="text-caption text-ink-3">
                        {contexte.copro.statut === "active" ? "Copropriété gérée par REAL 31" : "Ancienne copropriété (perdue)"}
                        {contexte.copro.priseEnGestionISO && ` · depuis le ${formatJour(contexte.copro.priseEnGestionISO)}`}
                        {contexte.copro.mandatFinISO && ` · mandat jusqu'au ${formatJour(contexte.copro.mandatFinISO)}`}
                      </span>
                    </span>
                  </Link>
                ) : (
                  <p className="text-caption text-ink-3">Pas dans nos copropriétés.</p>
                )}
                {contexte.autres.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <p className="text-caption text-ink-2">Déjà consulté {contexte.autres.length} fois :</p>
                    <ul className="flex flex-col divide-y divide-line">
                      {contexte.autres.map((a) => (
                        <li key={a.id}>
                          <Link href={`/propositions/${a.id}`} className="flex items-center justify-between gap-2 py-1.5 hover:underline">
                            <span className="text-body text-ink tabular-nums">{a.premierContactISO ? formatJour(a.premierContactISO) : formatJour(a.creeLeISO)}</span>
                            <span className="text-caption text-ink-3 truncate">{[a.contact.nom, a.prix.honorairesTtc !== undefined ? `${a.prix.honorairesTtc.toLocaleString("fr-FR")} €` : null].filter(Boolean).join(" · ")}</span>
                            <Badge ton={TON[a.statut]}>{LIBELLE_STATUT[a.statut]}</Badge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-caption text-ink-3">Première fois que cet immeuble nous consulte.</p>
                )}
              </>
            ) : (
              <>
                <p className="text-caption text-ink-2">
                  Pas encore rattachée au registre national. Le rattachement retrouve l&apos;historique de l&apos;immeuble et le lien avec nos copropriétés.
                </p>
                <RattacherRegistre propositionId={p.id} sur={suggestion?.sur} candidats={suggestion?.candidats ?? []} />
              </>
            )}
          </BlocLateral>
        </div>
      </Card>
    </div>
  );
}
