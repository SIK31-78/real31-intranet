"use client";

// Modifier la fiche entreprise (modale), bloquer / debloquer (direction, motif).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Entreprise } from "@/lib/domain/cles/types";
import { FormulaireEntreprise } from "./formulaire-entreprise";
import { bloquerEntrepriseAction } from "@/app/cles/actions";

export function EnTeteEntreprise({ entreprise, direction }: { entreprise: Entreprise; direction: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [edition, setEdition] = useState(false);
  const [blocage, setBlocage] = useState(false);
  const [motif, setMotif] = useState("");
  const [pending, demarrer] = useTransition();
  const bloquee = entreprise.statut === "bloquee";

  function basculer() {
    demarrer(async () => {
      const res = await bloquerEntrepriseAction({ entrepriseId: entreprise.id, bloquee: !bloquee, motif: motif || undefined });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok(bloquee ? `${entreprise.nom} débloquée.` : `${entreprise.nom} bloquée.`);
      setBlocage(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setEdition(true)}><Pencil strokeWidth={1.5} /> Modifier</Button>
      {direction && (
        <Button variant={bloquee ? "secondary" : "danger"} size="sm" onClick={() => setBlocage(true)}><Ban strokeWidth={1.5} /> {bloquee ? "Débloquer" : "Bloquer"}</Button>
      )}
      {edition && (
        <Modal titre={`Modifier ${entreprise.nom}`} onFermer={() => setEdition(false)} size="md">
          <ModalBody><FormulaireEntreprise entreprise={entreprise} onFermer={() => setEdition(false)} /></ModalBody>
        </Modal>
      )}
      {blocage && (
        <Modal titre={bloquee ? `Débloquer ${entreprise.nom}` : `Bloquer ${entreprise.nom}`} onFermer={() => setBlocage(false)} size="sm">
          <ModalBody>
            <div className="flex flex-col gap-3">
              <p className="text-body text-ink-2">{bloquee ? "L'entreprise pourra de nouveau emprunter des trousseaux." : "Plus aucun trousseau ne lui sera confié, sauf par la direction après confirmation."}</p>
              {!bloquee && (
                <Field label="Motif" htmlFor="bloc-motif" requis>
                  <Input id="bloc-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Trousseau perdu en 2025, impayés…" />
                </Field>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setBlocage(false)}>Annuler</Button>
            <Button variant={bloquee ? "primary" : "destructive"} loading={pending} disabled={!bloquee && !motif.trim()} onClick={basculer}>{bloquee ? "Débloquer" : "Bloquer"}</Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
