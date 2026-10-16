"use client";

// Les devis de contrôle (CTQ ascenseur, CTQ VMC gaz) : portés par la COPRO, pas par le cycle
// (un devis couvre l'immeuble), un seul retenu par sujet. « Retenir » / « Ne plus retenir »,
// « Retirer » sur les non retenus, « Ajouter un devis » dans une modale.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Field, Input } from "@/components/ui/field";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import type { DevisCtq, SujetCtq } from "@/lib/domain/contrats-copro";
import { ajouterDevisAction, retenirDevisAction, retirerDevisAction } from "@/app/contrats-copro/actions";
import { euros, jour, nombreSaisi } from "./commun";

export function DevisSujet({
  coproCode,
  sujet,
  devis,
  devisRetenuId,
  peutEcrire,
  aujourdhuiISO,
}: {
  coproCode: string;
  sujet: SujetCtq;
  devis: DevisCtq[];
  devisRetenuId: string | null;
  peutEcrire: boolean;
  aujourdhuiISO: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirmer = useConfirm();
  const [pending, demarrer] = useTransition();
  const [ajout, setAjout] = useState(false);
  const vivants = devis.filter((d) => !d.supprimeeLeISO);

  function retenir(devisId: string | null, nom: string) {
    demarrer(async () => {
      const res = await retenirDevisAction({ coproCode, sujet, devisId });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(devisId ? `Devis ${nom} retenu.` : `Devis ${nom} n'est plus retenu.`);
      router.refresh();
    });
  }

  async function retirer(d: DevisCtq) {
    const ok = await confirmer({ titre: "Retirer ce devis ?", message: `${d.prestataire}, ${euros(d.montant)}.`, confirmer: "Retirer", danger: true });
    if (!ok) return;
    demarrer(async () => {
      const res = await retirerDevisAction({ coproCode, devisId: d.id });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Devis ${d.prestataire} retiré.`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 min-h-7">
        <Eyebrow as="h4">Devis reçus{vivants.length ? ` · ${vivants.length}` : ""}</Eyebrow>
        {peutEcrire && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAjout(true)}>
            <Plus strokeWidth={1.5} /> Ajouter un devis
          </Button>
        )}
      </div>
      {vivants.length === 0 ? (
        <EmptyState icone={FileText} compact>
          Aucun devis reçu
        </EmptyState>
      ) : (
        <Table dense>
          <Thead>
            <Tr>
              <Th>Prestataire</Th>
              <Th numeric>Montant</Th>
              <Th>Reçu le</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {vivants.map((d) => {
              const retenu = d.id === devisRetenuId;
              return (
                <Tr key={d.id}>
                  <Td principal>
                    <span className="inline-flex items-center gap-2">
                      {d.prestataire}
                      {retenu && <Badge ton="brand">retenu</Badge>}
                    </span>
                  </Td>
                  <Td numeric>{euros(d.montant)}</Td>
                  <Td secondaire>{jour(d.recueLeISO, "")}</Td>
                  <Td numeric>
                    {peutEcrire && (
                      <span className="inline-flex items-center gap-1">
                        {retenu ? (
                          <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retenir(null, d.prestataire)}>
                            Ne plus retenir
                          </Button>
                        ) : (
                          <>
                            <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retenir(d.id, d.prestataire)}>
                              Retenir
                            </Button>
                            <Button type="button" variant="ghost" size="sm" loading={pending} onClick={() => retirer(d)}>
                              Retirer
                            </Button>
                          </>
                        )}
                      </span>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
      {ajout && <ModaleDevis coproCode={coproCode} sujet={sujet} aujourdhuiISO={aujourdhuiISO} onFermer={() => setAjout(false)} />}
    </div>
  );
}

function ModaleDevis({ coproCode, sujet, aujourdhuiISO, onFermer }: { coproCode: string; sujet: SujetCtq; aujourdhuiISO: string; onFermer: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, demarrer] = useTransition();
  const [prestataire, setPrestataire] = useState("");
  const [montant, setMontant] = useState("");
  const [recu, setRecu] = useState(aujourdhuiISO);
  const montantNum = nombreSaisi(montant);
  const pret = prestataire.trim().length > 0 && montantNum !== null && Number.isFinite(montantNum) && montantNum > 0;

  function valider() {
    if (!pret || montantNum === null) return;
    demarrer(async () => {
      const res = await ajouterDevisAction({ coproCode, sujet, prestataire: prestataire.trim(), montant: montantNum, recueLeISO: recu || null });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(`Devis ${prestataire.trim()} ajouté.`);
      onFermer();
      router.refresh();
    });
  }

  return (
    <Modal titre="Ajouter un devis" onFermer={onFermer} size="sm">
      <ModalBody>
        <div className="flex flex-col gap-3">
          <Field label="Prestataire" htmlFor="devis-prestataire" requis>
            <Input id="devis-prestataire" value={prestataire} onChange={(e) => setPrestataire(e.target.value)} autoFocus autoComplete="off" placeholder="Bureau Veritas, Socotec…" />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Montant (€)" htmlFor="devis-montant" requis>
              <Input id="devis-montant" inputMode="decimal" value={montant} onChange={(e) => setMontant(e.target.value)} className="text-right tabular-nums" />
            </Field>
            <Field label="Reçu le" htmlFor="devis-recu">
              <Input id="devis-recu" type="date" max={aujourdhuiISO} value={recu} onChange={(e) => setRecu(e.target.value)} />
            </Field>
          </div>
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
