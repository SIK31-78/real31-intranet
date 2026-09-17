"use client";

// La fiche d'une proposition : UN formulaire, UN bouton « Enregistrer » (barre fixe en bas,
// active seulement quand quelque chose a change). Retour du test du 17/09/2026 : quatre
// boutons d'enregistrement, un bloc « suivi » sans sens pour l'utilisateur, l'AG saisie deux
// fois, le gestionnaire en texte libre. Desormais : le pilotage (statut, agence, gestionnaire,
// origine) en tete, puis le contact, l'immeuble, le prix ; a droite l'immeuble au registre.

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Calculator, Loader2, Save } from "lucide-react";
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
  TON_STATUT,
  type Immeuble,
  type Origine,
  type Proposition,
  type StatutProposition,
} from "@/lib/domain/proposition/proposition";
import type { ContexteImmeuble, PrixCalcule, SuggestionRapprochement } from "@/lib/services/proposition/propositions";
import { DetacherRegistre, RattacherRegistre } from "@/components/proposition/rattacher-registre";
import { calculerPrixAction, mettreAJourPropositionAction } from "../actions";
import { formatEuros } from "@/lib/domain/format-montant";
import { Journal } from "@/components/ui/journal";

const euros = formatEuros;
const nb = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
const txt = (v: number | undefined) => (v === undefined ? "" : String(v));
const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Un gestionnaire proposable pour porter la proposition : nom + code de son agence. */
export interface GestionnaireChoix {
  nomComplet: string;
  agence?: string;
}

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
  gestionnaires,
  contexte,
  suggestion,
  droits,
}: {
  proposition: Proposition;
  prixGrille: PrixCalcule;
  agences: string[];
  gestionnaires: GestionnaireChoix[];
  contexte: ContexteImmeuble;
  suggestion?: SuggestionRapprochement;
  /** Ce que le collaborateur connecte peut faire ici (cf. lib/auth/roles). */
  droits: { completer: boolean; offre: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();

  // --- Pilotage ---
  const [statut, setStatut] = useState<StatutProposition>(p.statut);
  const [agence, setAgence] = useState(p.agence ?? "");
  const [gestionnaire, setGestionnaire] = useState(p.gestionnaire ?? "");
  const [origine, setOrigine] = useState<Origine | "">(p.origine ?? "");
  // --- Contact ---
  const [contact, setContact] = useState(p.contact);
  // --- Immeuble (une seule date d'AG : celle de l'immeuble) ---
  const [im, setIm] = useState<Immeuble>({ ...p.immeuble, ...(p.immeuble.prochaineAgISO || !p.agPrevueISO ? {} : { prochaineAgISO: p.agPrevueISO }) });
  const champ = <K extends keyof Immeuble>(k: K, v: Immeuble[K]) => setIm((i) => ({ ...i, [k]: v }));
  // --- Prix : la grille est la base, le geste commercial s'en deduit (ou l'inverse) ---
  const [prix, setPrix] = useState(prixGrille);
  const grilleInitiale = p.prix.grilleTtc ?? (prixGrille.grilleDisponible ? prixGrille.forfait.grilleTtc : undefined);
  const [geste, setGeste] = useState(txt(p.prix.gesteCommercialTtc ?? (p.prix.honorairesTtc !== undefined && grilleInitiale !== undefined ? arrondi(grilleInitiale - p.prix.honorairesTtc) : 0)));
  const [honoraires, setHonoraires] = useState(txt(p.prix.honorairesTtc ?? grilleInitiale));
  const [timbres, setTimbres] = useState(txt(p.prix.timbresTtc ?? (prixGrille.grilleDisponible ? prixGrille.forfait.timbresTtc : undefined)));
  const [reels, setReels] = useState(p.prix.fraisPostauxReels ?? true);
  const [conditions, setConditions] = useState(p.prix.conditionsParticulieres ?? "");
  // --- Notes ---
  const [commentaires, setCommentaires] = useState(p.commentaires ?? "");
  const [note, setNote] = useState("");

  const base = prix.grilleDisponible ? prix.forfait.grilleTtc : grilleInitiale;
  const changerGeste = (v: string) => {
    setGeste(v);
    const g = nb(v);
    if (base !== undefined) setHonoraires(txt(arrondi(base - (g ?? 0))));
  };
  const changerHonoraires = (v: string) => {
    setHonoraires(v);
    const h = nb(v);
    if (base !== undefined && h !== undefined) setGeste(txt(arrondi(base - h)));
  };
  const hono = nb(honoraires);

  // Ce qui partira a l'enregistrement : tout, en un seul appel. Le prix n'est envoye que si
  // la personne peut faire l'offre (l'action le refuserait sinon), le statut seulement s'il
  // a change (clore une proposition est reserve a la direction).
  const maj = useMemo(() => {
    const m: Record<string, unknown> = {
      immeuble: im,
      contact,
      agence: agence || null,
      gestionnaire: gestionnaire || null,
      origine: origine || null,
      commentaires: commentaires || null,
      ...(statut !== p.statut ? { statut } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    if (droits.offre && hono !== undefined) {
      m.prix = {
        honorairesTtc: hono,
        gesteCommercialTtc: nb(geste) ?? 0,
        timbresTtc: reels ? 0 : nb(timbres),
        fraisPostauxReels: reels,
        ...(conditions.trim() ? { conditionsParticulieres: conditions.trim() } : {}),
        ...(prix.grilleDisponible ? { grilleTtc: prix.forfait.grilleTtc, grilleTimbresTtc: prix.forfait.timbresTtc, anneeGrille: prix.annee } : {}),
      };
    }
    return m;
  }, [im, contact, agence, gestionnaire, origine, commentaires, statut, note, droits.offre, hono, geste, reels, timbres, conditions, prix, p.statut]);

  // L'etat de depart, fige au montage : « modifie » = le formulaire ne serialise plus pareil.
  // La page remonte le composant apres chaque enregistrement (key = majLeISO), donc le
  // point de depart suit toujours ce qui est en base.
  const [initial] = useState(() => JSON.stringify(maj));
  const modifie = JSON.stringify(maj) !== initial;

  function enregistrer() {
    demarrer(async () => {
      const res = await mettreAJourPropositionAction({ id: p.id, ...maj });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Proposition enregistrée.");
      setNote("");
      router.refresh();
    });
  }

  function recalculer() {
    demarrer(async () => {
      const res = await calculerPrixAction(im);
      if (!res.ok || !res.donnees) return toast.err(res.ok ? "Calcul impossible." : res.erreur);
      setPrix(res.donnees);
      if (res.donnees.grilleDisponible) {
        setHonoraires(txt(arrondi(res.donnees.forfait.grilleTtc - (nb(geste) ?? 0))));
        setTimbres(txt(res.donnees.forfait.timbresTtc));
        toast.ok(`Grille ${res.donnees.annee} recalculée : ${euros(res.donnees.forfait.grilleTtc)} TTC.`);
      } else {
        toast.err(`La grille ${res.donnees.annee} n'est pas dans le barème.`);
      }
    });
  }

  const ecart = hono !== undefined && prix.grilleDisponible ? ecartGrille(hono, prix.forfait.grilleTtc) : null;
  const manquant = informationsManquantes({ immeuble: im, contact });
  const gestionnairesProposes = gestionnaires.filter((g) => !agence || !g.agence || g.agence === agence);
  const num = (id: string, label: string, k: keyof Immeuble, placeholder?: string) => (
    <Field label={label} htmlFor={id}>
      <Input id={id} inputMode="numeric" value={txt(im[k] as number | undefined)} onChange={(e) => champ(k, nb(e.target.value) as never)} placeholder={placeholder} className="tabular-nums" />
    </Field>
  );
  const lectureSeule = !droits.completer;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
      {/* ---- Colonne principale : le formulaire, du pilotage au prix ---- */}
      <div className="flex flex-col gap-5 min-w-0">
        {manquant.length > 0 && STATUTS_OUVERTS.has(p.statut) && (
          <Callout ton="warn">Pour faire l&apos;offre, il manque encore : {manquant.join(", ")}.</Callout>
        )}
        {lectureSeule && <Callout ton="neutral">Lecture seule : l&apos;équipe syndic complète cette fiche.</Callout>}

        <fieldset disabled={lectureSeule} className="contents">
          <Card>
            <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Statut" htmlFor="ps-statut">
                <Select id="ps-statut" value={statut} onChange={(e) => setStatut(e.target.value as StatutProposition)}>
                  {STATUTS_PROPOSITION.map((s) => <option key={s} value={s}>{LIBELLE_STATUT[s]}</option>)}
                </Select>
              </Field>
              <Field label="Agence" htmlFor="ps-agence">
                <Select id="ps-agence" value={agence} onChange={(e) => setAgence(e.target.value)}>
                  <option value="">—</option>
                  {agences.map((a) => <option key={a} value={a}>{a}</option>)}
                </Select>
              </Field>
              <Field label="Gestionnaire" htmlFor="ps-gest" hint={agence ? `de l'agence ${agence}` : "choisir l'agence d'abord"}>
                <Select id="ps-gest" value={gestionnaire} onChange={(e) => setGestionnaire(e.target.value)}>
                  <option value="">—</option>
                  {gestionnaire && !gestionnairesProposes.some((g) => g.nomComplet === gestionnaire) && <option value={gestionnaire}>{gestionnaire}</option>}
                  {gestionnairesProposes.map((g) => <option key={g.nomComplet} value={g.nomComplet}>{g.nomComplet}</option>)}
                </Select>
              </Field>
              <Field label="Comment nous a-t-il connus ?" htmlFor="ps-origine">
                <Select id="ps-origine" value={origine} onChange={(e) => setOrigine(e.target.value as Origine | "")}>
                  <option value="">—</option>
                  {ORIGINES.map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE[o]}</option>)}
                </Select>
              </Field>
              <p className="col-span-2 sm:col-span-4 text-meta text-ink-3">
                {p.remisePropositionISO ? `Offre remise le ${formatJour(p.remisePropositionISO)}` : "Offre pas encore remise"}
                {(p.agPrevueISO ?? im.prochaineAgISO) && ` · AG prévue le ${formatJour(p.agPrevueISO ?? im.prochaineAgISO!)}`}
                {p.decisionISO && ` · décision le ${formatJour(p.decisionISO)}`}
                {p.coproCode && ` · copropriété ${p.coproCode}`}
              </p>
            </CardBody>
          </Card>

          <Section id="prop-contact" titre="Le contact">
            <Card>
              <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Nom" htmlFor="pc-nom"><Input id="pc-nom" value={contact.nom ?? ""} onChange={(e) => setContact({ ...contact, nom: e.target.value })} /></Field>
                <Field label="Rôle" htmlFor="pc-role"><Input id="pc-role" value={contact.role ?? ""} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="président du CS, copropriétaire…" /></Field>
                <Field label="Téléphone" htmlFor="pc-tel"><Input id="pc-tel" value={contact.telephone ?? ""} onChange={(e) => setContact({ ...contact, telephone: e.target.value })} inputMode="tel" /></Field>
                <Field label="E-mail" htmlFor="pc-email"><Input id="pc-email" type="email" value={contact.email ?? ""} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
              </CardBody>
            </Card>
          </Section>

          <Section id="prop-immeuble" titre="L'immeuble">
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
                  <Field label="AG prévue" htmlFor="pi-ag" hint="celle qui votera le contrat"><Input id="pi-ag" type="date" value={im.prochaineAgISO ?? ""} onChange={(e) => champ("prochaineAgISO", e.target.value || undefined)} /></Field>
                </div>
                <details className="group">
                  <summary className="cursor-pointer text-body text-ink-2 hover:text-ink select-none">Fiche de visite : équipements, clôture, assurance, litiges, notes</summary>
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
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <Field label="Assurance du syndicat" htmlFor="pi-assurance" className="col-span-2 sm:col-span-4" hint="si inconnue, le contrat dit seulement « titulaire d'un contrat d'assurance responsabilité civile »"><Input id="pi-assurance" value={im.assurance ?? ""} onChange={(e) => champ("assurance", e.target.value)} placeholder="assureur" /></Field>
                      <Field label="Souscrite le" htmlFor="pi-assurance-date" className="col-span-2"><Input id="pi-assurance-date" type="date" value={im.assuranceDateISO ?? ""} onChange={(e) => champ("assuranceDateISO", e.target.value || undefined)} /></Field>
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

          <Section
            id="prop-prix"
            titre="Le prix"
            actions={
              droits.offre ? (
                <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={recalculer} title="Recalcule la grille à partir des lots et des équipements saisis ci-dessus">
                  <Calculator strokeWidth={1.5} /> Recalculer la grille
                </Button>
              ) : (
                <span className="text-meta text-ink-3">prix et offre : réservés à la direction</span>
              )
            }
          >
            <Card>
              <CardBody className="flex flex-col gap-4">
                <fieldset disabled={!droits.offre} className="contents">
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 border-t border-line pt-4">
                    <Field label="Geste commercial (€ TTC / an)" htmlFor="pp-geste" hint="négatif = majoration"><Input id="pp-geste" inputMode="decimal" value={geste} onChange={(e) => changerGeste(e.target.value)} className="tabular-nums" /></Field>
                    <Field label="Honoraires retenus (TTC)" htmlFor="pp-hono" hint="= grille − geste"><Input id="pp-hono" inputMode="decimal" value={honoraires} onChange={(e) => changerHonoraires(e.target.value)} className="tabular-nums font-medium" /></Field>
                    <div className="flex items-end pb-2 gap-3">
                      <Choix type="radio" name="pp-frais" label="Frais réels" checked={reels} onChange={() => setReels(true)} />
                      <Choix type="radio" name="pp-frais" label="Forfait timbres" checked={!reels} onChange={() => setReels(false)} />
                    </div>
                    {!reels && <Field label="Forfait timbres (TTC)" htmlFor="pp-timbres"><Input id="pp-timbres" inputMode="decimal" value={timbres} onChange={(e) => setTimbres(e.target.value)} className="tabular-nums" /></Field>}
                  </div>
                  {ecart !== null && ecart !== 0 && (
                    <p className="text-meta text-ink-2">
                      {ecart < 0 ? "Remise" : "Majoration"} de <span className="font-medium tabular-nums">{Math.abs(ecart).toLocaleString("fr-FR")} %</span> par rapport à la grille — trace interne, le client ne la voit pas.
                    </p>
                  )}
                  <Field label="Conditions particulières du contrat" htmlFor="pp-conditions" hint="une clause, une ligne ou deux que le gabarit n'a pas : imprimées à la fin du contrat, un paragraphe par ligne">
                    <Textarea id="pp-conditions" rows={3} value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ex. : Le syndic s'engage à tenir une première réunion du conseil syndical dans le mois suivant la prise de fonction." />
                  </Field>
                </fieldset>
              </CardBody>
            </Card>
          </Section>

          <Section id="prop-notes" titre="Notes">
            <Card>
              <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Commentaires" htmlFor="ps-comm"><Textarea id="ps-comm" rows={2} value={commentaires} onChange={(e) => setCommentaires(e.target.value)} /></Field>
                <Field label="Ajouter au journal" htmlFor="ps-note" hint="daté et signé à l'enregistrement"><Textarea id="ps-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rappelé le CS, visite prévue le…" /></Field>
              </CardBody>
            </Card>
          </Section>
        </fieldset>

        {/* ---- LA barre d'enregistrement : une seule, collée en bas de l'écran tant qu'on est dans le formulaire ---- */}
        {droits.completer && (
          <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface/95 backdrop-blur px-3 h-12 shadow-2 print:hidden">
            <span className={`text-meta ${modifie ? "text-warn-700 font-medium" : "text-ink-3"}`}>
              {modifie ? "Modifications non enregistrées" : "Tout est enregistré"}
            </span>
            <Button type="button" variant="primary" disabled={pending || !modifie} onClick={enregistrer}>
              {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Save strokeWidth={1.5} />} Enregistrer
            </Button>
          </div>
        )}

        {p.journal.length > 0 && (
          <Section id="prop-journal" titre="Journal" compte={p.journal.length}>
            <Card>
              <CardBody>
                <Journal entrees={p.journal} />
              </CardBody>
            </Card>
          </Section>
        )}
        <p className="text-meta text-ink-3">Créée le {formatDateLongue(p.creeLeISO)} par {p.creeParNom}{p.premierContactISO && ` · premier contact le ${formatJour(p.premierContactISO)}`}</p>
      </div>

      {/* ---- Colonne laterale : l'immeuble au registre et son historique ---- */}
      <Card>
        <BlocLateral titre="Cet immeuble" actions={p.immeuble.immatriculation && droits.completer ? <DetacherRegistre propositionId={p.id} /> : undefined}>
          {p.immeuble.immatriculation ? (
            <>
              <p className="text-meta text-ink-2">
                Registre national : <span className="font-mono">{p.immeuble.immatriculation}</span>
                {p.immeuble.periodeConstruction && ` · construit ${libellePeriodeConstruction(p.immeuble.periodeConstruction)}`}
              </p>
              {contexte.copro ? (
                <Link href={`/copros/${contexte.copro.code}`} className="flex items-start gap-2 rounded-md border border-line p-3 hover:bg-surface-2">
                  <Building2 strokeWidth={1.5} className="h-4 w-4 mt-0.5 shrink-0 text-ink-2" />
                  <span className="min-w-0 flex flex-col">
                    <span className="text-body text-ink"><span className="font-mono text-ink-2">{contexte.copro.code}</span> {contexte.copro.nom}</span>
                    <span className="text-meta text-ink-3">
                      {contexte.copro.statut === "active" ? "Copropriété gérée par REAL 31" : "Ancienne copropriété (perdue)"}
                      {contexte.copro.priseEnGestionISO && ` · depuis le ${formatJour(contexte.copro.priseEnGestionISO)}`}
                      {contexte.copro.mandatFinISO && ` · mandat jusqu'au ${formatJour(contexte.copro.mandatFinISO)}`}
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="text-meta text-ink-3">Pas dans nos copropriétés.</p>
              )}
              {contexte.autres.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="text-meta text-ink-2">Déjà consulté {contexte.autres.length} fois :</p>
                  <ul className="flex flex-col divide-y divide-line">
                    {contexte.autres.map((a) => (
                      <li key={a.id}>
                        <Link href={`/propositions/${a.id}`} className="flex items-center justify-between gap-2 py-1.5 hover:underline">
                          <span className="text-body text-ink tabular-nums">{a.premierContactISO ? formatJour(a.premierContactISO) : formatJour(a.creeLeISO)}</span>
                          <span className="text-meta text-ink-3 truncate">{[a.contact.nom, a.prix.honorairesTtc !== undefined ? euros(a.prix.honorairesTtc) : null].filter(Boolean).join(" · ")}</span>
                          <Badge ton={TON_STATUT[a.statut]}>{LIBELLE_STATUT[a.statut]}</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-meta text-ink-3">Première fois que cet immeuble nous consulte.</p>
              )}
            </>
          ) : (
            <>
              <p className="text-meta text-ink-2">
                Pas encore rattachée au registre national. Le rattachement retrouve l&apos;historique de l&apos;immeuble et le lien avec nos copropriétés.
              </p>
              {droits.completer && <RattacherRegistre propositionId={p.id} sur={suggestion?.sur} candidats={suggestion?.candidats ?? []} />}
            </>
          )}
        </BlocLateral>
      </Card>

    </div>
  );
}
