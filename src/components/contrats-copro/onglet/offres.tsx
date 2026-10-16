"use client";

// Les offres du cycle en cours (assurance, gaz) : un tableau, la retenue marquée, « Retirer »
// sur les autres, « Ajouter une offre » dans une modale. Une offre retenue ne se retire pas
// (D13) : le service le refuse, l'écran ne propose pas le bouton.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { LIBELLE_TYPE_PRIX_GAZ, type Cycle, type OffreAssurance, type OffreGaz, type TypePrixGaz } from "@/lib/domain/contrats-copro";
import { ajouterOffreAssuranceAction, ajouterOffreGazAction, retirerOffreAssuranceAction, retirerOffreGazAction } from "@/app/contrats-copro/actions";
import { euros, jour, nombreSaisi, ouNull, pluriel } from "./commun";

type Props =
  | { sujet: "assurance"; offres: OffreAssurance[] }
  | { sujet: "gaz"; offres: OffreGaz[] };

export function OffresCycle({ coproCode, cycle, peutEcrire, aujourdhuiISO, ...p }: Props & { coproCode: string; cycle: Cycle; peutEcrire: boolean; aujourdhuiISO: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [ajout, setAjout] = useState(false);
  const offres = p.offres.filter((o) => !o.supprimeeLeISO);
  const ecrit = peutEcrire && cycle.statut !== "archive";

  async function retirer(offreId: string, nom: string, montant: number) {
    const ok = await confirmer({ titre: "Retirer cette offre ?", message: `${nom}, ${euros(montant)}. Elle n'apparaîtra plus dans le comparatif.`, confirmer: "Retirer", danger: true });
    if (!ok) return;
    demarrer(async () => {
      const res = p.sujet === "assurance" ? await retirerOffreAssuranceAction({ coproCode, cycleId: cycle.id, offreId }) : await retirerOffreGazAction({ coproCode, cycleId: cycle.id, offreId });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Offre ${nom} retirée.`);
      router.refresh();
    });
  }

  const retenue = (id: string) => cycle.offreRetenueId === id;
  const boutonRetirer = (id: string, nom: string, montant: number) =>
    ecrit && !retenue(id) ? (
      <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retirer(id, nom, montant)}>
        Retirer
      </Button>
    ) : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 min-h-7">
        <Eyebrow as="h4">Offres reçues{offres.length ? ` · ${offres.length}` : ""}</Eyebrow>
        {ecrit && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAjout(true)}>
            <Plus strokeWidth={1.5} /> Ajouter une offre
          </Button>
        )}
      </div>
      {offres.length === 0 ? (
        <EmptyState icone={FileText} compact>
          Aucune offre reçue pour ce cycle
        </EmptyState>
      ) : p.sujet === "assurance" ? (
        <Table dense>
          <Thead>
            <Tr>
              <Th>Assureur</Th>
              <Th numeric>Prime</Th>
              <Th numeric>Franchise</Th>
              <Th>Garanties</Th>
              <Th>Reçue le</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {(offres as OffreAssurance[]).map((o) => (
              <Tr key={o.id}>
                <Td principal>
                  <span className="inline-flex items-center gap-2">
                    {o.assureur}
                    {retenue(o.id) && <Badge ton="brand">retenue</Badge>}
                  </span>
                </Td>
                <Td numeric>{euros(o.prime)}</Td>
                <Td numeric>{euros(o.franchise)}</Td>
                <Td secondaire className="max-w-64 truncate" title={o.garanties ?? undefined}>
                  {o.garanties ?? ""}
                </Td>
                <Td secondaire>{jour(o.recueLeISO, "")}</Td>
                <Td numeric>{boutonRetirer(o.id, o.assureur, o.prime)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      ) : (
        <Table dense>
          <Thead>
            <Tr>
              <Th>Fournisseur</Th>
              <Th>Type de prix</Th>
              <Th numeric>Montant annuel</Th>
              <Th numeric>Durée</Th>
              <Th>Reçue le</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {(offres as OffreGaz[]).map((o) => (
              <Tr key={o.id}>
                <Td principal>
                  <span className="inline-flex items-center gap-2">
                    {o.fournisseur}
                    {retenue(o.id) && <Badge ton="brand">retenue</Badge>}
                  </span>
                </Td>
                <Td secondaire>{LIBELLE_TYPE_PRIX_GAZ[o.typePrix]}</Td>
                <Td numeric>{euros(o.montant)}</Td>
                <Td numeric>{pluriel(o.dureeMois, "mois", "mois")}</Td>
                <Td secondaire>{jour(o.recueLeISO, "")}</Td>
                <Td numeric>{boutonRetirer(o.id, o.fournisseur, o.montant)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
      {ajout && <ModaleOffre sujet={p.sujet} coproCode={coproCode} cycleId={cycle.id} aujourdhuiISO={aujourdhuiISO} onFermer={() => setAjout(false)} />}
    </div>
  );
}

function ModaleOffre({ sujet, coproCode, cycleId, aujourdhuiISO, onFermer }: { sujet: "assurance" | "gaz"; coproCode: string; cycleId: string; aujourdhuiISO: string; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [nom, setNom] = useState("");
  const [montant, setMontant] = useState("");
  const [franchise, setFranchise] = useState("0");
  const [garanties, setGaranties] = useState("");
  const [typePrix, setTypePrix] = useState<TypePrixGaz>("fixe");
  const [duree, setDuree] = useState("36");
  const [recue, setRecue] = useState(aujourdhuiISO);

  const montantNum = nombreSaisi(montant);
  const franchiseNum = nombreSaisi(franchise);
  const dureeNum = nombreSaisi(duree);
  const pret =
    nom.trim().length > 0 &&
    montantNum !== null &&
    Number.isFinite(montantNum) &&
    montantNum > 0 &&
    (sujet === "assurance" ? franchiseNum !== null && Number.isFinite(franchiseNum) && franchiseNum >= 0 : dureeNum !== null && Number.isInteger(dureeNum) && dureeNum > 0);

  function valider() {
    if (!pret || montantNum === null) return;
    demarrer(async () => {
      const res =
        sujet === "assurance"
          ? await ajouterOffreAssuranceAction({ coproCode, cycleId, assureur: nom.trim(), prime: montantNum, franchise: franchiseNum ?? 0, garanties: ouNull(garanties), recueLeISO: recue || null })
          : await ajouterOffreGazAction({ coproCode, cycleId, fournisseur: nom.trim(), typePrix, montant: montantNum, dureeMois: dureeNum ?? 0, recueLeISO: recue || null });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Offre ${nom.trim()} ajoutée.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre={sujet === "assurance" ? "Ajouter une offre d'assurance" : "Ajouter une offre de gaz"} onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label={sujet === "assurance" ? "Assureur" : "Fournisseur"} htmlFor="offre-nom" requis>
            <Input id="offre-nom" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus autoComplete="off" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={sujet === "assurance" ? "Prime annuelle (€)" : "Montant annuel (€)"} htmlFor="offre-montant" requis>
              <Input id="offre-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} className="text-right tabular-nums" />
            </Field>
            {sujet === "assurance" ? (
              <Field label="Franchise (€)" htmlFor="offre-franchise" hint="0 si l'offre est sans franchise.">
                <Input id="offre-franchise" inputMode="decimal" value={franchise} onChange={(e) => setFranchise(e.target.value)} className="text-right tabular-nums" />
              </Field>
            ) : (
              <Field label="Durée (mois)" htmlFor="offre-duree" requis hint="Fait l'échéance du contrat à la validation.">
                <Input id="offre-duree" inputMode="numeric" value={duree} onChange={(e) => setDuree(e.target.value)} className="text-right tabular-nums" />
              </Field>
            )}
          </div>
          {sujet === "gaz" && (
            <Field label="Type de prix" htmlFor="offre-type">
              <Select id="offre-type" value={typePrix} onChange={(e) => setTypePrix(e.target.value as TypePrixGaz)}>
                {(Object.keys(LIBELLE_TYPE_PRIX_GAZ) as TypePrixGaz[]).map((t) => (
                  <option key={t} value={t}>
                    {LIBELLE_TYPE_PRIX_GAZ[t]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {sujet === "assurance" && (
            <Field label="Garanties (facultatif)" htmlFor="offre-garanties">
              <Textarea id="offre-garanties" rows={2} value={garanties} onChange={(e) => setGaranties(e.target.value)} placeholder="Dégât des eaux, RC, protection juridique…" />
            </Field>
          )}
          <Field label="Reçue le" htmlFor="offre-recue">
            <Input id="offre-recue" type="date" max={aujourdhuiISO} value={recue} onChange={(e) => setRecue(e.target.value)} />
          </Field>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onFermer}>
          Annuler
        </Button>
        <Button variant="primary" loading={pending} disabled={!pret} onClick={valider}>
          <Plus strokeWidth={1.5} /> Ajouter
        </Button>
      </ModalFooter>
    </Modal>
  );
}
