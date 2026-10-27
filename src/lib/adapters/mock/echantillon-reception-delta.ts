// Lecture incrementale FICTIVE de la boite « echantillon » (REA-419, 27/10/2026) : au premier
// passage (sans jeton), les mails de l'echantillon ; ensuite, plus rien de neuf. Sert au
// developpement sans la vraie boite, comme EchantillonTriIngestion.

import type { OptionsDelta, ReceptionDeltaProvider, ResultatDelta } from "@/lib/ports/reception-delta";
import { ECHANTILLON } from "./echantillon-tri-ingestion";

const JETON = "echantillon:delta";

export class EchantillonReceptionDelta implements ReceptionDeltaProvider {
  async lireDelta(_boite: string, opts: OptionsDelta): Promise<ResultatDelta> {
    const ajoutes = opts.jeton === JETON ? [] : [...ECHANTILLON];
    return { ajoutes, retires: [], pages: 1, jeton: JETON, complet: true, reinitialise: false };
  }
}
