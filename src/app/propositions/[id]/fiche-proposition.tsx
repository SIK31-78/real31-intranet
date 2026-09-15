"use client";

// La fiche d'une proposition : l'immeuble (la fiche de visite), le contact, le prix
// (grille calculée + écart libre, invisible du client), le statut, le journal.
// Chaque bloc s'enregistre seul.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  ORIGINES,
  STATUTS_PROPOSITION,
  type Immeuble,
  type Origine,
  type Proposition,
  type StatutProposition,
} from "@/lib/domain/proposition/proposition";
import type { PrixCalcule } from "@/lib/services/proposition/propositions";
import { calculerPrixAction, mettreAJourPropositionAction } from "../actions";

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const nb = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));
const txt = (v: number | undefined) => (v === undefined ? "" : String(v));

export function FicheProposition({ proposition: p, prixGrille, agences }: { proposition: Proposition; prixGrille: PrixCalcule; agences: string[] }) {
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

  return (
    <div className="flex flex-col gap-6">
      {manquant.length > 0 && (
        <p className="text-body text-warn-700">Pour faire l&apos;offre, il manque encore : {manquant.join(", ")}.</p>
      )}

      <Section id="prop-immeuble" titre="L'immeuble (fiche de visite)">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Adresse" htmlFor="pi-adresse" className="sm:col-span-2"><Input id="pi-adresse" value={im.adresse} onChange={(e) => champ("adresse", e.target.value)} /></Field>
              <Field label="Code postal" htmlFor="pi-cp"><Input id="pi-cp" value={im.codePostal ?? ""} onChange={(e) => champ("codePostal", e.target.value)} /></Field>
              <Field label="Commune" htmlFor="pi-commune"><Input id="pi-commune" value={im.commune ?? ""} onChange={(e) => champ("commune", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <Field label="Lots principaux" htmlFor="pi-lots"><Input id="pi-lots" inputMode="numeric" value={txt(im.lotsPrincipaux)} onChange={(e) => champ("lotsPrincipaux", nb(e.target.value))} /></Field>
              <Field label="Copropriétaires" htmlFor="pi-copros"><Input id="pi-copros" inputMode="numeric" value={txt(im.coproprietaires)} onChange={(e) => champ("coproprietaires", nb(e.target.value))} /></Field>
              <Field label="Cages d'escalier" htmlFor="pi-cages"><Input id="pi-cages" inputMode="numeric" value={txt(im.cagesEscalier)} onChange={(e) => champ("cagesEscalier", nb(e.target.value))} /></Field>
              <Field label="Ascenseurs" htmlFor="pi-asc"><Input id="pi-asc" inputMode="numeric" value={txt(im.ascenseurs)} onChange={(e) => champ("ascenseurs", nb(e.target.value))} /></Field>
              <Field label="Portes de parking" htmlFor="pi-portes"><Input id="pi-portes" inputMode="numeric" value={txt(im.portesGarage)} onChange={(e) => champ("portesGarage", nb(e.target.value))} /></Field>
              <Field label="Gardiens" htmlFor="pi-gardiens"><Input id="pi-gardiens" inputMode="numeric" value={txt(im.gardiens)} onChange={(e) => champ("gardiens", nb(e.target.value))} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="flex items-end pb-2 sm:col-span-2">
                <Choix type="checkbox" label="Chauffage collectif" checked={im.chauffageCollectif ?? false} onChange={(e) => champ("chauffageCollectif", e.target.checked)} />
              </div>
              <Field label="Employés d'immeuble" htmlFor="pi-emp"><Input id="pi-emp" inputMode="numeric" value={txt(im.employesImmeuble)} onChange={(e) => champ("employesImmeuble", nb(e.target.value))} /></Field>
              <Field label="Ménage" htmlFor="pi-menage"><Input id="pi-menage" value={im.menage ?? ""} onChange={(e) => champ("menage", e.target.value)} placeholder="société / employé" /></Field>
              <Field label="Visites prévues" htmlFor="pi-visites"><Input id="pi-visites" inputMode="numeric" value={txt(im.visitesPrevues)} onChange={(e) => champ("visitesPrevues", nb(e.target.value))} placeholder="1" /></Field>
              <Field label="CS complémentaires" htmlFor="pi-cs"><Input id="pi-cs" inputMode="numeric" value={txt(im.csPrevus)} onChange={(e) => champ("csPrevus", nb(e.target.value))} /></Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Syndic actuel" htmlFor="pi-syndic"><Input id="pi-syndic" value={im.syndicActuel ?? ""} onChange={(e) => champ("syndicActuel", e.target.value)} /></Field>
              <Field label="Fin de son mandat" htmlFor="pi-finmandat"><Input id="pi-finmandat" type="date" value={im.finMandatActuelISO ?? ""} onChange={(e) => champ("finMandatActuelISO", e.target.value || undefined)} /></Field>
              <Field label="Prochaine AG" htmlFor="pi-ag"><Input id="pi-ag" type="date" value={im.prochaineAgISO ?? ""} onChange={(e) => champ("prochaineAgISO", e.target.value || undefined)} /></Field>
              <Field label="Clôture comptable" htmlFor="pi-cloture"><Input id="pi-cloture" value={im.clotureComptable ?? ""} onChange={(e) => champ("clotureComptable", e.target.value)} placeholder="31/12" /></Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Litiges / procédures" htmlFor="pi-litiges"><Textarea id="pi-litiges" rows={2} value={im.litiges ?? ""} onChange={(e) => champ("litiges", e.target.value)} /></Field>
              <Field label="Notes de visite" htmlFor="pi-notes"><Textarea id="pi-notes" rows={2} value={im.notes ?? ""} onChange={(e) => champ("notes", e.target.value)} /></Field>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-caption text-ink-3">
                {im.immatriculation ? `Registre national : ${im.immatriculation}` : "Pas d'immatriculation connue"}
                {im.periodeConstruction && ` · construit ${im.periodeConstruction.toLowerCase().replace(/_/g, " ")}`}
              </p>
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => enregistrer({ immeuble: im }, "Immeuble enregistré.")}>
                <Save strokeWidth={1.5} /> Enregistrer l&apos;immeuble
              </Button>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section id="prop-prix" titre="Le prix">
        <Card>
          <CardBody className="flex flex-col gap-4">
            {prix.grilleDisponible ? (
              <DataList align="left">
                {prix.forfait.details.map((d) => (
                  <DataRow key={d.ligne} label={d.libelle}>
                    <span className="tabular-nums">{d.quantite > 1 ? `${d.quantite} × ${euros(d.unitaireTtc)} = ` : ""}{euros(d.montantTtc)}</span>
                  </DataRow>
                ))}
                <DataRow label={`Grille ${prix.annee} — honoraires`}>
                  <span className="font-medium tabular-nums">{euros(prix.forfait.grilleTtc)} TTC</span>
                  <span className="text-ink-3"> ({euros(prix.forfait.grilleHt)} HT)</span>
                </DataRow>
              </DataList>
            ) : (
              <p className="text-body text-warn-700">La grille du forfait {prix.annee} n&apos;est pas dans `intranet_tarifs` : le prix se saisit à la main.</p>
            )}
            <div className="flex flex-wrap items-end gap-4">
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={recalculer}>Recalculer depuis l&apos;immeuble</Button>
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
            </div>
            {ecart !== null && ecart !== 0 && (
              <p className="text-body text-ink-2">
                {ecart < 0 ? "Remise" : "Majoration"} de <span className="font-medium tabular-nums">{Math.abs(ecart).toLocaleString("fr-FR")} %</span> par rapport à la grille — trace interne, le client ne la voit pas.
              </p>
            )}
          </CardBody>
        </Card>
      </Section>

      <Section id="prop-contact" titre="Le contact">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Field label="Nom" htmlFor="pc-nom"><Input id="pc-nom" value={contact.nom ?? ""} onChange={(e) => setContact({ ...contact, nom: e.target.value })} /></Field>
              <Field label="Rôle" htmlFor="pc-role"><Input id="pc-role" value={contact.role ?? ""} onChange={(e) => setContact({ ...contact, role: e.target.value })} /></Field>
              <Field label="Téléphone" htmlFor="pc-tel"><Input id="pc-tel" value={contact.telephone ?? ""} onChange={(e) => setContact({ ...contact, telephone: e.target.value })} /></Field>
              <Field label="E-mail" htmlFor="pc-email"><Input id="pc-email" value={contact.email ?? ""} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => enregistrer({ contact }, "Contact enregistré.")}><Save strokeWidth={1.5} /> Enregistrer le contact</Button>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section id="prop-suivi" titre="Le suivi">
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
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
              <Field label="Gestionnaire" htmlFor="ps-gest"><Input id="ps-gest" value={gestionnaire} onChange={(e) => setGestionnaire(e.target.value)} /></Field>
              <Field label="Origine" htmlFor="ps-origine">
                <Select id="ps-origine" value={origine} onChange={(e) => setOrigine(e.target.value as Origine | "")}>
                  <option value="">—</option>
                  {ORIGINES.map((o) => <option key={o} value={o}>{LIBELLE_ORIGINE[o]}</option>)}
                </Select>
              </Field>
              <Field label="Proposition remise le" htmlFor="ps-remise"><Input id="ps-remise" type="date" value={remise} onChange={(e) => setRemise(e.target.value)} /></Field>
              <Field label="AG prévue le" htmlFor="ps-ag"><Input id="ps-ag" type="date" value={agPrevue} onChange={(e) => setAgPrevue(e.target.value)} /></Field>
              <Field label="Commentaires" htmlFor="ps-comm" className="sm:col-span-2"><Input id="ps-comm" value={commentaires} onChange={(e) => setCommentaires(e.target.value)} /></Field>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Field label="Ajouter au journal" htmlFor="ps-note" className="flex-1 min-w-64"><Input id="ps-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Rappelé le CS, visite prévue le…" /></Field>
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
                {pending ? <Loader2 strokeWidth={1.5} className="animate-spin" /> : <Save strokeWidth={1.5} />} Enregistrer le suivi
              </Button>
            </div>
            {p.decisionISO && <p className="text-caption text-ink-3">Décision le {formatJour(p.decisionISO)}{p.coproCode && ` · copropriété ${p.coproCode}`}</p>}
          </CardBody>
        </Card>
      </Section>

      {p.journal.length > 0 && (
        <Section id="prop-journal" titre="Journal" compte={p.journal.length}>
          <Card>
            <CardBody>
              <ul className="flex flex-col gap-1 text-body">
                {[...p.journal].reverse().map((j, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-ink-3 tabular-nums shrink-0">{formatDateLongue(j.quandISO.slice(0, 10))}</span>
                    <span className="text-ink-2 shrink-0">{j.par}</span>
                    <span>{j.texte}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </Section>
      )}
      <p className="text-caption text-ink-3">Créée le {formatDateLongue(p.creeLeISO)} par {p.creeParNom}{p.premierContactISO && ` · premier contact le ${formatJour(p.premierContactISO)}`}</p>
    </div>
  );
}
