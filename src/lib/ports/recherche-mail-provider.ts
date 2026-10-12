// Port de l'écran « Échanges » : chercher dans une boîte (tous dossiers, envoyés compris)
// et lire un message trouvé. LECTURE SEULE. Ne dépend que du domaine.

import type { EchangeTrouve } from "@/lib/domain/echanges";

export interface RechercheMailProvider {
  /** Messages de la boîte qui répondent à la requête KQL, les plus récents d'abord. */
  rechercher(p: { boite: string; kql: string; max: number }): Promise<EchangeTrouve[]>;
  /** Un message précis, par son internetMessageId (stable quand le mail est déplacé) ; null s'il n'y est plus. */
  trouver(p: { boite: string; internetMessageId: string }): Promise<EchangeTrouve | null>;
  /** Corps complet d'un message trouvé, en texte. */
  lireCorps(p: { boite: string; id: string }): Promise<string>;
}
