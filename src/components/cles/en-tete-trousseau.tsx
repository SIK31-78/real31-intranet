"use client";

// L'en-tete de la fiche trousseau : les gestes du comptoir + « Modifier » (modale du
// formulaire). Client parce que la modale a un etat ; le reste de la fiche est serveur.

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal, ModalBody } from "@/components/ui/modal";
import type { Trousseau, EtatTrousseau, Pret, Reservation } from "@/lib/domain/cles/types";
import { ActionsTrousseau } from "./actions-trousseau";
import { FormulaireTrousseau, type CoproChoix } from "./formulaire-trousseau";

export function EnTeteTrousseau(props: {
  trousseau: Trousseau;
  etat: EtatTrousseau;
  pret: Pret | null;
  reservations: Reservation[];
  aujourdhuiISO: string;
  peutOperer: boolean;
  direction: boolean;
  copros: CoproChoix[];
}) {
  const [edition, setEdition] = useState(false);
  return (
    <span className="flex items-center gap-2 flex-wrap justify-end">
      <ActionsTrousseau {...props} />
      {props.peutOperer && (
        <Button variant="ghost" size="md" onClick={() => setEdition(true)}>
          <Pencil strokeWidth={1.5} /> Modifier
        </Button>
      )}
      {edition && (
        <Modal titre={`Modifier ${props.trousseau.numero}`} onFermer={() => setEdition(false)} size="lg">
          <ModalBody>
            <FormulaireTrousseau copros={props.copros} trousseau={props.trousseau} onFermer={() => setEdition(false)} />
          </ModalBody>
        </Modal>
      )}
    </span>
  );
}
