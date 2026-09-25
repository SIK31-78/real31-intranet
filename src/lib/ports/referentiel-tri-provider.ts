// Port du referentiel du tri des e-mails (ADR-043) : les coproprietes ESTALE, leur
// gestionnaire et l'index adresse e-mail -> copros. Ne depend que du domaine.

import type { ReferentielTri } from "@/lib/domain/tri-emails";

export interface ReferentielTriProvider {
  charger(): Promise<ReferentielTri>;
}
