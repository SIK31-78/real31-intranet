"use client";

// Modale ouvrant un module interne de l'intranet depuis la checklist de supervision,
// pre-scope a la copro courante. 2e porte d'entree : les modules Recap AG et
// Facturation restent autonomes (leurs pages continuent de marcher a l'identique),
// cette modale ne fait que les rappeler ici sans quitter la supervision.

import { Modal } from "@/components/ui/modal";
import { FormulaireRecapAg } from "@/components/recap-ag/formulaire-recap-ag";
import { FormulaireFacturation } from "@/components/facturation/formulaire-facturation";

export type ModuleSupervision = "recap" | "depassement_cs";

export function ModuleModal({
  module,
  copro,
  agDateISO,
  creneauCsSuggere,
  pennylaneActif,
  onFermer,
}: {
  module: ModuleSupervision;
  copro: { code: string; nomCourt: string };
  /** Creneau reel du CS (issu de sa confirmation) -> pre-remplit les honoraires CS. */
  creneauCsSuggere?: { jour: string; debut: string; fin?: string };
  /** Date ISO de l'AG courante (pre-remplit la date du recap) ; null si AG sans date. */
  agDateISO: string | null;
  pennylaneActif: boolean;
  onFermer: () => void;
}) {
  if (module === "recap") {
    return (
      <Modal titre={`Récap AG · ${copro.nomCourt}`} onFermer={onFermer}>
        <FormulaireRecapAg
          copros={[
            {
              code: copro.code,
              nom: copro.nomCourt,
              ...(agDateISO ? { agDateSuggeree: agDateISO } : {}),
            },
          ]}
          pennylaneActif={pennylaneActif}
          onSucces={onFermer}
        />
      </Modal>
    );
  }

  return (
    <Modal titre={`Honoraires CS · ${copro.nomCourt}`} onFermer={onFermer}>
      <FormulaireFacturation
        copros={[{ code: copro.code, nom: copro.nomCourt }]}
        pennylaneActif={pennylaneActif}
        coproFixe={copro.code}
        {...(creneauCsSuggere ? { creneauCsSuggere } : {})}
        depassementCsSeul
        onSucces={onFermer}
      />
    </Modal>
  );
}
