// Adapter mock de la memoire des creneaux Outlook derives d'une AG : etat en memoire
// (module-level), suffisant pour le dev / la demo. Cle CODE__ROLE, comme la table
// (pk copro_code, role) - SANS la date d'AG, cf. le port.

import type {
  ProjectionOutlook,
  ProjectionsOutlookRepository,
} from "@/lib/ports/projections-outlook-repository";
import type { RoleCreneauAg } from "@/lib/domain/jalons-ag/creneaux";

const STORE = new Map<string, ProjectionOutlook>();

function cle(coproCode: string, role: RoleCreneauAg): string {
  return `${coproCode}__${role}`;
}

export class MockProjectionsOutlookRepository implements ProjectionsOutlookRepository {
  async get(coproCode: string): Promise<ProjectionOutlook[]> {
    return [...STORE.values()].filter((p) => p.coproCode === coproCode);
  }

  async enregistrerProjection(
    coproCode: string,
    role: RoleCreneauAg,
    eventId: string | null,
    boite: string | null,
  ): Promise<boolean> {
    // Upsert (comme le SQL) : la ligne naiT avec l'evenement, la memorisation reussit
    // toujours en memoire -> l'appelant ne supprime jamais d'orphelin en mock.
    STORE.set(cle(coproCode, role), {
      coproCode,
      role,
      ...(eventId && boite ? { outlookEventId: eventId, outlookBoite: boite } : {}),
    });
    return true;
  }
}
