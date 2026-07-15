// Adapter DRY-RUN du port EstaleFicheContactProvider : n'ecrit RIEN dans eStale. Renvoie
// une note decrivant la mutation qui SERAIT appliquee. C'est le defaut (ESTALE_ECRITURE non
// positionne sur "reel") : le flux fiche de renseignements marche de bout en bout sans
// jamais toucher la production. Aucun reseau.

import type {
  EstaleFicheContactProvider,
  MajEmailOwnerInput,
  MajEmailResultat,
} from "@/lib/reprise/ports/estale-fiche-contact-provider";

export class DryRunEstaleFicheContactProvider implements EstaleFicheContactProvider {
  async mettreAJourEmailOwner(input: MajEmailOwnerInput): Promise<MajEmailResultat> {
    const cible = [input.nom, input.prenom].filter(Boolean).join(" ");
    return {
      applique: false,
      note: `Dry-run : updateOwner de "${cible}" (copro ${input.coproCode}) -> email a poser (aucune ecriture reelle).`,
    };
  }
}
