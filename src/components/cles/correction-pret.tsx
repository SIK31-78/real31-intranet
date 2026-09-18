"use client";

// Corriger un pret passe (direction) : un champ, une valeur, un motif. L'original reste au
// journal, la correction le reference.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody, ModalFooter } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import type { Pret } from "@/lib/domain/cles/types";
import { corrigerPretAction } from "@/app/cles/actions";

const CHAMPS = [
  { valeur: "retourPrevuLeISO", libelle: "Date de retour prévue", type: "date" },
  { valeur: "sortiLeISO", libelle: "Horodatage de sortie", type: "datetime-local" },
  { valeur: "renduLeISO", libelle: "Horodatage de retour", type: "datetime-local" },
  { valeur: "motif", libelle: "Intervention", type: "text" },
  { valeur: "commentaireRetour", libelle: "Commentaire de retour", type: "text" },
] as const;

export function CorrectionPret({ pret }: { pret: Pret }) {
  const router = useRouter();
  const toast = useToast();
  const [ouvert, setOuvert] = useState(false);
  const [champ, setChamp] = useState<(typeof CHAMPS)[number]["valeur"]>("retourPrevuLeISO");
  const [valeur, setValeur] = useState("");
  const [motif, setMotif] = useState("");
  const [pending, demarrer] = useTransition();
  const def = CHAMPS.find((c) => c.valeur === champ)!;

  function valider() {
    demarrer(async () => {
      const v = def.type === "datetime-local" && valeur ? new Date(valeur).toISOString() : valeur;
      const res = await corrigerPretAction({ pretId: pret.id, trousseauId: pret.trousseauId, champ, valeur: v, motif });
      if (!res.ok) return toast.err(res.erreur);
      toast.ok("Correction enregistrée au journal.");
      setOuvert(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOuvert(true)}>Corriger</Button>
      {ouvert && (
        <Modal titre="Corriger ce prêt" onFermer={() => setOuvert(false)} size="sm">
          <ModalBody>
            <div className="flex flex-col gap-3">
              <p className="text-body text-ink-2">L&apos;original reste au journal ; la correction s&apos;y ajoute avec son motif.</p>
              <Field label="Champ" htmlFor="corr-champ">
                <Select id="corr-champ" value={champ} onChange={(e) => { setChamp(e.target.value as typeof champ); setValeur(""); }}>
                  {CHAMPS.filter((c) => c.valeur !== "renduLeISO" || pret.renduLeISO).map((c) => <option key={c.valeur} value={c.valeur}>{c.libelle}</option>)}
                </Select>
              </Field>
              <Field label="Nouvelle valeur" htmlFor="corr-valeur" hint={typeof pret[champ] === "string" ? `Actuellement : ${String(pret[champ]).slice(0, 16)}` : undefined}>
                <Input id="corr-valeur" type={def.type} value={valeur} onChange={(e) => setValeur(e.target.value)} />
              </Field>
              <Field label="Motif" htmlFor="corr-motif" requis>
                <Input id="corr-motif" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Erreur de saisie, retour oublié…" />
              </Field>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setOuvert(false)}>Annuler</Button>
            <Button variant="primary" loading={pending} disabled={!motif.trim() || (!valeur && def.type !== "text")} onClick={valider}>Corriger</Button>
          </ModalFooter>
        </Modal>
      )}
    </>
  );
}
