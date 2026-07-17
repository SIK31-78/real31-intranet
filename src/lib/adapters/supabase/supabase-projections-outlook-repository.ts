// Adapter Supabase de la memoire des creneaux Outlook derives d'une AG (table native
// intranet_projections_outlook, base patron, service_role). Cle (copro_code, role),
// SANS la date d'AG : deplacer l'AG deplace le MEME evenement (cf. le port).
//
// Degradation propre : si la table n'existe pas encore (SQL pas lance : 42P01 /
// PGRST205), la lecture renvoie [] et l'ecriture renvoie `false` -> l'appelant supprime
// l'evenement qu'il vient de creer (jamais d'orphelin, jamais de doublon) et la pose de
// la date d'AG, elle, n'est pas affectee.

import type {
  ProjectionOutlook,
  ProjectionsOutlookRepository,
} from "@/lib/ports/projections-outlook-repository";
import type { RoleCreneauAg } from "@/lib/domain/jalons-ag/creneaux";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_projections_outlook";

function tableAbsente(error: { code?: string; message?: string }): boolean {
  // ATTENTION : ne matcher QUE la table absente. Une COLONNE manquante (PGRST204,
  // "could not find the 'x' column ... in the schema cache") doit THROW, pas devenir un
  // no-op silencieux - c'est un bug de schema a corriger, pas un etat attendu (le piege
  // a deja coute une soiree sur reprise_fiche_renseignements).
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

interface Ligne {
  copro_code: string;
  role: string;
  outlook_event_id: string | null;
  outlook_boite: string | null;
}

/** Role valide (liste fermee) : filtre une valeur inattendue en base. */
function versRole(v: string): RoleCreneauAg | undefined {
  return v === "MISE_SOUS_PLI" || v === "RELANCE_DATE_AG" ? v : undefined;
}

export class SupabaseProjectionsOutlookRepository implements ProjectionsOutlookRepository {
  async get(coproCode: string): Promise<ProjectionOutlook[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("copro_code, role, outlook_event_id, outlook_boite")
      .eq("copro_code", coproCode);
    if (error) {
      if (tableAbsente(error)) return []; // SQL pas lance : aucune projection connue
      throw new Error(`Projections Outlook lecture : ${error.message}`);
    }
    return ((data as Ligne[] | null) ?? []).flatMap((l) => {
      const role = versRole(l.role);
      if (!role) return [];
      return [
        {
          coproCode: l.copro_code,
          role,
          ...(l.outlook_event_id ? { outlookEventId: l.outlook_event_id } : {}),
          ...(l.outlook_boite ? { outlookBoite: l.outlook_boite } : {}),
        },
      ];
    });
  }

  async enregistrerProjection(
    coproCode: string,
    role: RoleCreneauAg,
    eventId: string | null,
    boite: string | null,
  ): Promise<boolean> {
    const sb = createSupabasePublicClient();
    // Upsert (et non UPDATE cible comme intranet_confirmations_evenement) : ici AUCUNE
    // ligne ne preexiste, la memoire du creneau naiT avec l'evenement. `.select()` ->
    // RETURNING : on sait si la ligne a reellement ete ecrite. `false` (table absente /
    // echec) => l'appelant supprime l'evenement Graph orphelin.
    const { data, error } = await sb
      .from(TABLE)
      .upsert(
        {
          copro_code: coproCode,
          role,
          outlook_event_id: eventId,
          outlook_boite: boite,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "copro_code,role" },
      )
      .select("copro_code");
    if (error) {
      if (tableAbsente(error)) return false; // SQL pas lance : rien memorise
      throw new Error(`Projections Outlook ecriture : ${error.message}`);
    }
    return Array.isArray(data) && data.length > 0;
  }
}
