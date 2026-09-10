"use client";

// Confirmation DACTYLOGRAPHIEE d'une ligne surfacturee de plus de 20 %.
//
// Ce n'est PAS un blocage : la ligne peut partir. C'est une preuve que la
// comptable a vu l'alerte ultime -- taper un mot demande un geste conscient, ce
// qu'un enieme bouton « Confirmer » ne demande plus. Une ligne non confirmee est
// simplement laissee de cote, sans empecher le reste de la fournee de partir.
//
// Accessibilite : la modale du design system pose le focus, piege le Tab et
// ferme sur Echap ; on ajoute juste Entree pour valider quand le mot est bon.

import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import {
  MOT_DE_CONFIRMATION,
  motConfirmationValide,
} from "@/lib/domain/facturation/filet-gestion-courante";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function DialogueConfirmationEcrite({
  coproCode,
  montant,
  attendu,
  ecart,
  onConfirmer,
  onAnnuler,
}: {
  coproCode: string;
  /** Montant qui partira, deja formate. */
  montant: string;
  /** Attendu au contrat, deja formate. */
  attendu: string;
  /** Ecart relatif, deja formate (ex "+38,2 %"). */
  ecart: string;
  onConfirmer: () => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState("");
  const champId = useId();
  const aideId = useId();
  const valide = motConfirmationValide(saisie);

  return (
    <Modal titre={`Confirmer la facturation de ${coproCode}`} onFermer={onAnnuler}>
      <div className="flex flex-col gap-4 px-4 py-4">
        <div className="flex items-start gap-2 rounded-md border border-err-500/30 bg-err-50 px-3 py-2.5 text-body text-err-700">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
          <p>
            Cette copropriété serait facturée <strong>{ecart}</strong> au-dessus de son contrat.
            Une fois émise, la facture est engagée comptablement.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md bg-line">
          <div className="bg-surface px-3 py-2">
            <dt className="text-meta uppercase tracking-wide text-ink-3">Montant facturé</dt>
            <dd className="mt-0.5 text-title font-semibold text-ink">{montant} HT</dd>
          </div>
          <div className="bg-surface px-3 py-2">
            <dt className="text-meta uppercase tracking-wide text-ink-3">Attendu au contrat</dt>
            <dd className="mt-0.5 text-title font-semibold text-ink">{attendu} HT</dd>
          </div>
        </dl>

        <div>
          <label className="mb-1 block text-body text-ink" htmlFor={champId}>
            Pour émettre cette ligne, tape le mot{" "}
            <strong className="font-semibold">{MOT_DE_CONFIRMATION}</strong>.
          </label>
          <Input
            id={champId}
            aria-describedby={aideId}
            autoComplete="off"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valide) {
                e.preventDefault();
                onConfirmer();
              }
            }}
           
          />
          <p id={aideId} className="mt-1 text-body text-ink-3">
            La casse et les espaces n&apos;ont pas d&apos;importance. Échap annule.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={onAnnuler}
            variant="secondary" size="lg"
          >
            Annuler
          </Button>
          <Button
            onClick={onConfirmer}
            disabled={!valide}
            variant="destructive" size="lg"
          >
            Facturer {coproCode}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
