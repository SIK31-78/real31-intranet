// Port de l'écran « Échanges » : chercher dans une boîte (tous dossiers, envoyés compris)
// et lire un message trouvé. LECTURE SEULE. Ne dépend que du domaine.

import type { EchangeTrouve, ReponseEnvoyee } from "@/lib/domain/echanges";
import type { BrouillonLu } from "@/lib/domain/brouillon-edition";

export interface RechercheMailProvider {
  /** Messages de la boîte qui répondent à la requête KQL, les plus récents d'abord. */
  rechercher(p: { boite: string; kql: string; max: number }): Promise<EchangeTrouve[]>;
  /** Un message précis, par son internetMessageId (stable quand le mail est déplacé) ; null s'il n'y est plus. */
  trouver(p: { boite: string; internetMessageId: string }): Promise<EchangeTrouve | null>;
  /** Les derniers messages du dossier « Éléments envoyés », les plus récents d'abord (écran
   *  E-mails, vue « Envoyés », REA-341). `date` = date d'envoi. `depuis` (ISO, 30/10/2026) :
   *  seulement ceux envoyés depuis cette date, `max` au plus. */
  envoyes(p: { boite: string; max: number; depuis?: string }): Promise<EchangeTrouve[]>;
  /** Les brouillons de la boîte (dossier « Brouillons »), les plus récemment modifiés d'abord
   *  (vue « Brouillons », 02/11/2026). `date` = dernière modification. */
  brouillons(p: { boite: string; max: number }): Promise<EchangeTrouve[]>;
  /** Un brouillon complet pour le rouvrir dans l'éditeur (02/11/2026) : destinataires (Cci
   *  compris), objet, corps HTML brut, pièces jointes hors images « en ligne ». null : absent,
   *  ou ce n'est pas un brouillon. */
  lireBrouillonComplet(p: { boite: string; id: string }): Promise<BrouillonLu | null>;
  /** Corps complet d'un message trouvé, en texte. */
  lireCorps(p: { boite: string; id: string }): Promise<string>;
  /** Les messages ENVOYÉS de la boîte dans une conversation, après une date, du plus ancien au plus récent. */
  envoyesDuFil(p: { boite: string; conversationId: string; apres: string; max: number }): Promise<ReponseEnvoyee[]>;
}
