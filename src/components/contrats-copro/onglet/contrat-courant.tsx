"use client";

// Le contrat courant d'un sujet (ce que la copro SAIT de son contrat, hors cycles) en liste
// label / valeur, et « Corriger » qui ouvre le formulaire du sujet. Le courtier se choisit dans
// le référentiel du cabinet (ou en texte libre) ; un courtier partenaire archive le suivi, on
// le dit avant d'enregistrer. Les compteurs d'équipement ont leur petite modale à part.

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList, DataRow } from "@/components/ui/data-list";
import { Field, Input, Select } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_TYPE_PRIX_GAZ, type ContratCourant, type PatchContratCourant, type TypePrixGaz } from "@/lib/domain/contrats-copro";
import type { EntrepriseMetier } from "@/lib/services/contrats-copro/prestataires";
import { corrigerContratAction } from "@/app/contrats-copro/actions";
import { A_RENSEIGNER, euros, jour, nombreSaisi, ouNull } from "./commun";

type SujetContrat = "assurance" | "gaz" | "ctq_vmc";

const TITRE: Record<SujetContrat, string> = { assurance: "Contrat en cours", gaz: "Contrat en cours", ctq_vmc: "Installation" };

function Valeur({ children }: { children: string | null | undefined }) {
  return children ? <>{children}</> : <span className="font-normal text-ink-3">{A_RENSEIGNER}</span>;
}

export function ContratCourantCarte({
  coproCode,
  sujet,
  contrat,
  peutEcrire,
  courtiers,
  compteurs,
}: {
  coproCode: string;
  sujet: SujetContrat;
  contrat: ContratCourant;
  peutEcrire: boolean;
  /** Les courtiers du référentiel (assurance). */
  courtiers?: EntrepriseMetier[];
  /** Une ligne de plus en bas (compteur déclaré), avec son bouton de correction. */
  compteurs?: ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);
  const { assurance, gaz, vmc } = contrat;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{TITRE[sujet]}</CardTitle>
        {peutEcrire && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(true)}>
            <Pencil strokeWidth={1.5} /> Corriger
          </Button>
        )}
      </CardHeader>
      <CardBody padding="sm" className="flex flex-col gap-2">
        <DataList align="left">
          {sujet === "assurance" && (
            <>
              <DataRow label="Compagnie">
                <Valeur>{assurance.compagnie}</Valeur>
              </DataRow>
              <DataRow label="N° de contrat">
                <Valeur>{assurance.numeroContrat}</Valeur>
              </DataRow>
              <DataRow label="Courtier">{assurance.courtier ? assurance.courtier : <span className="font-normal text-ink-3">aucun</span>}</DataRow>
              <DataRow label="Souscription">
                <Valeur>{assurance.souscriptionISO ? jour(assurance.souscriptionISO) : null}</Valeur>
              </DataRow>
              <DataRow label="Échéance">
                <Valeur>{assurance.echeanceISO ? jour(assurance.echeanceISO) : null}</Valeur>
              </DataRow>
              <DataRow label="Prime annuelle">
                <Valeur>{assurance.prime === null ? null : euros(assurance.prime)}</Valeur>
              </DataRow>
            </>
          )}
          {sujet === "gaz" && (
            <>
              <DataRow label="Fournisseur">
                <Valeur>{gaz.fournisseur}</Valeur>
              </DataRow>
              <DataRow label="Type de prix">
                <Valeur>{gaz.typePrix ? LIBELLE_TYPE_PRIX_GAZ[gaz.typePrix] : null}</Valeur>
              </DataRow>
              <DataRow label="Montant annuel">
                <Valeur>{gaz.montant === null ? null : euros(gaz.montant)}</Valeur>
              </DataRow>
              <DataRow label="Échéance">
                <Valeur>{gaz.echeanceISO ? jour(gaz.echeanceISO) : null}</Valeur>
              </DataRow>
            </>
          )}
          {sujet === "ctq_vmc" && (
            <>
              <DataRow label="Société">
                <Valeur>{vmc.societe}</Valeur>
              </DataRow>
              <DataRow label="Référence">
                <Valeur>{vmc.reference}</Valeur>
              </DataRow>
              <DataRow label="Dernier contrôle">
                <Valeur>{vmc.dernierCtqISO ? jour(vmc.dernierCtqISO) : null}</Valeur>
              </DataRow>
            </>
          )}
        </DataList>
        {compteurs}
      </CardBody>
      {ouvert && <ModaleContrat coproCode={coproCode} sujet={sujet} contrat={contrat} courtiers={courtiers ?? []} onFermer={() => setOuvert(false)} />}
    </Card>
  );
}

const AUTRE = "__autre__";

function ModaleContrat({ coproCode, sujet, contrat, courtiers, onFermer }: { coproCode: string; sujet: SujetContrat; contrat: ContratCourant; courtiers: EntrepriseMetier[]; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const a = contrat.assurance;
  const g = contrat.gaz;
  const v = contrat.vmc;
  const courtierConnu = a.courtier ? courtiers.some((c) => c.nom === a.courtier) : true;

  const [compagnie, setCompagnie] = useState(a.compagnie ?? "");
  const [numero, setNumero] = useState(a.numeroContrat ?? "");
  const [choixCourtier, setChoixCourtier] = useState(courtierConnu ? (a.courtier ?? "") : AUTRE);
  const [courtierLibre, setCourtierLibre] = useState(courtierConnu ? "" : (a.courtier ?? ""));
  const [souscription, setSouscription] = useState(a.souscriptionISO ?? "");
  const [echeanceAss, setEcheanceAss] = useState(a.echeanceISO ?? "");
  const [prime, setPrime] = useState(a.prime === null ? "" : String(a.prime));

  const [fournisseur, setFournisseur] = useState(g.fournisseur ?? "");
  const [typePrix, setTypePrix] = useState<TypePrixGaz | "">(g.typePrix ?? "");
  const [montant, setMontant] = useState(g.montant === null ? "" : String(g.montant));
  const [echeanceGaz, setEcheanceGaz] = useState(g.echeanceISO ?? "");

  const [societe, setSociete] = useState(v.societe ?? "");
  const [reference, setReference] = useState(v.reference ?? "");
  const [dernierCtq, setDernierCtq] = useState(v.dernierCtqISO ?? "");

  const courtierRetenu = choixCourtier === AUTRE ? ouNull(courtierLibre) : ouNull(choixCourtier);
  const partenaireChoisi = courtiers.find((c) => c.nom === courtierRetenu)?.courtierPartenaire === true;
  const primeNum = nombreSaisi(prime);
  const montantNum = nombreSaisi(montant);
  const nombresOk = (primeNum === null || (Number.isFinite(primeNum) && primeNum >= 0)) && (montantNum === null || (Number.isFinite(montantNum) && montantNum >= 0));

  function valider() {
    if (!nombresOk) return;
    const patch: PatchContratCourant =
      sujet === "assurance"
        ? { assurance: { compagnie: ouNull(compagnie), numeroContrat: ouNull(numero), courtier: courtierRetenu, souscriptionISO: ouNull(souscription), echeanceISO: ouNull(echeanceAss), prime: primeNum } }
        : sujet === "gaz"
          ? { gaz: { fournisseur: ouNull(fournisseur), typePrix: typePrix || null, montant: montantNum, echeanceISO: ouNull(echeanceGaz) } }
          : { vmc: { societe: ouNull(societe), reference: ouNull(reference), dernierCtqISO: ouNull(dernierCtq) } };
    demarrer(async () => {
      const res = await corrigerContratAction({ coproCode, patch });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Contrat corrigé.");
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={sujet === "ctq_vmc" ? "Corriger l'installation VMC" : sujet === "gaz" ? "Corriger le contrat de gaz" : "Corriger le contrat d'assurance"} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          {sujet === "assurance" && (
            <>
              <Field label="Compagnie" htmlFor="ct-compagnie">
                <Input id="ct-compagnie" value={compagnie} onChange={(e) => setCompagnie(e.target.value)} autoFocus autoComplete="off" />
              </Field>
              <Field label="N° de contrat" htmlFor="ct-numero">
                <Input id="ct-numero" value={numero} onChange={(e) => setNumero(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Courtier" htmlFor="ct-courtier">
                <Select id="ct-courtier" value={choixCourtier} onChange={(e) => setChoixCourtier(e.target.value)}>
                  <option value="">Aucun courtier</option>
                  {courtiers.map((c) => (
                    <option key={c.id} value={c.nom}>
                      {c.nom}
                      {c.courtierPartenaire ? " (partenaire)" : ""}
                    </option>
                  ))}
                  <option value={AUTRE}>Autre…</option>
                </Select>
              </Field>
              {choixCourtier === AUTRE && (
                <Field label="Nom du courtier" htmlFor="ct-courtier-libre">
                  <Input id="ct-courtier-libre" value={courtierLibre} onChange={(e) => setCourtierLibre(e.target.value)} autoComplete="off" />
                </Field>
              )}
              {partenaireChoisi && <Callout ton="warn">Choisir un courtier partenaire archive le suivi : le courtier s&rsquo;en charge.</Callout>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Souscription" htmlFor="ct-souscription">
                  <Input id="ct-souscription" type="date" value={souscription} onChange={(e) => setSouscription(e.target.value)} />
                </Field>
                <Field label="Échéance" htmlFor="ct-echeance">
                  <Input id="ct-echeance" type="date" value={echeanceAss} onChange={(e) => setEcheanceAss(e.target.value)} />
                </Field>
              </div>
              <Field label="Prime annuelle (€)" htmlFor="ct-prime" erreur={primeNum !== null && !(Number.isFinite(primeNum) && primeNum >= 0) ? "Montant illisible." : undefined}>
                <Input id="ct-prime" inputMode="decimal" value={prime} onChange={(e) => setPrime(e.target.value)} className="text-right tabular-nums" />
              </Field>
            </>
          )}
          {sujet === "gaz" && (
            <>
              <Field label="Fournisseur" htmlFor="ct-fournisseur">
                <Input id="ct-fournisseur" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} autoFocus autoComplete="off" />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Type de prix" htmlFor="ct-type">
                  <Select id="ct-type" value={typePrix} onChange={(e) => setTypePrix(e.target.value as TypePrixGaz | "")}>
                    <option value="">Non renseigné</option>
                    {(Object.keys(LIBELLE_TYPE_PRIX_GAZ) as TypePrixGaz[]).map((t) => (
                      <option key={t} value={t}>
                        {LIBELLE_TYPE_PRIX_GAZ[t]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Montant annuel (€)" htmlFor="ct-montant" erreur={montantNum !== null && !(Number.isFinite(montantNum) && montantNum >= 0) ? "Montant illisible." : undefined}>
                  <Input id="ct-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} className="text-right tabular-nums" />
                </Field>
              </div>
              <Field label="Échéance" htmlFor="ct-echeance-gaz">
                <Input id="ct-echeance-gaz" type="date" value={echeanceGaz} onChange={(e) => setEcheanceGaz(e.target.value)} />
              </Field>
            </>
          )}
          {sujet === "ctq_vmc" && (
            <>
              <Field label="Société" htmlFor="ct-societe">
                <Input id="ct-societe" value={societe} onChange={(e) => setSociete(e.target.value)} autoFocus autoComplete="off" />
              </Field>
              <Field label="Référence" htmlFor="ct-reference">
                <Input id="ct-reference" value={reference} onChange={(e) => setReference(e.target.value)} autoComplete="off" />
              </Field>
              <Field label="Dernier contrôle" htmlFor="ct-dernier">
                <Input id="ct-dernier" type="date" value={dernierCtq} onChange={(e) => setDernierCtq(e.target.value)} />
              </Field>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!nombresOk} onClick={valider}>
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// --- Les compteurs d'équipement ----------------------------------------------------------------

/** « corriger les compteurs » : un bouton discret, la modale des trois compteurs déclaratifs. */
export function BoutonCompteurs({ coproCode, contrat, peutEcrire, libelle = "corriger les compteurs" }: { coproCode: string; contrat: ContratCourant; peutEcrire: boolean; libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  if (!peutEcrire) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(true)}>
        <Pencil strokeWidth={1.5} /> {libelle}
      </Button>
      {ouvert && <ModaleCompteurs coproCode={coproCode} contrat={contrat} onFermer={() => setOuvert(false)} />}
    </>
  );
}

function ModaleCompteurs({ coproCode, contrat, onFermer }: { coproCode: string; contrat: ContratCourant; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const c = contrat.compteurs;
  const texte = (n: number | null) => (n === null ? "" : String(n));
  const [ascenseurs, setAscenseurs] = useState(texte(c.ascenseurs));
  const [chaudieres, setChaudieres] = useState(texte(c.chaudieres));
  const [vmcGaz, setVmcGaz] = useState(texte(c.vmcGaz));

  const entier = (s: string): number | null | undefined => {
    const t = s.trim();
    if (t === "") return null;
    return /^\d+$/.test(t) ? Number(t) : undefined;
  };
  const valeurs = { ascenseurs: entier(ascenseurs), chaudieres: entier(chaudieres), vmcGaz: entier(vmcGaz) };
  const ok = Object.values(valeurs).every((v) => v !== undefined);

  function valider() {
    if (!ok) return;
    demarrer(async () => {
      const res = await corrigerContratAction({ coproCode, patch: { compteurs: { ascenseurs: valeurs.ascenseurs ?? null, chaudieres: valeurs.chaudieres ?? null, vmcGaz: valeurs.vmcGaz ?? null } } });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Compteurs corrigés.");
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre="Compteurs d'équipement" onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <p className="text-body text-ink-2">0 = la copropriété n&rsquo;est pas concernée ; vide = jamais renseigné.</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ascenseurs" htmlFor="cpt-asc">
              <Input id="cpt-asc" inputMode="numeric" value={ascenseurs} onChange={(e) => setAscenseurs(e.target.value)} className="text-right tabular-nums" autoFocus />
            </Field>
            <Field label="Chaudières" htmlFor="cpt-chaud">
              <Input id="cpt-chaud" inputMode="numeric" value={chaudieres} onChange={(e) => setChaudieres(e.target.value)} className="text-right tabular-nums" />
            </Field>
            <Field label="VMC gaz" htmlFor="cpt-vmc">
              <Input id="cpt-vmc" inputMode="numeric" value={vmcGaz} onChange={(e) => setVmcGaz(e.target.value)} className="text-right tabular-nums" />
            </Field>
          </div>
          {!ok && <Callout ton="err">Un compteur est un nombre entier.</Callout>}
          <p className="text-meta text-ink-2">L&rsquo;énergie de chauffage (gaz, fioul…) se corrige dans la section Immeuble.</p>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!ok} onClick={valider}>
          Enregistrer
        </Button>
      </ModalFooter>
    </Modal>
  );
}
