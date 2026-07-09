// Adapter Supabase de la confirmation des dates AG/CS (table native
// intranet_confirmations_evenement, base patron, service_role). Si la table n'existe
// pas encore (SQL pas lance), la fonctionnalite degrade proprement : lecture -> vide,
// ecriture -> no-op silencieux (l'app fonctionne comme avant).

import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import type { ConfirmationEvenementRepository } from "@/lib/ports/confirmation-evenement-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_confirmations_evenement";
// Colonnes historiques (toujours presentes). Les colonnes de ressources (salle /
// vehicule, increment 4) sont ajoutees SEPAREMENT : tant que l'ALTER n'est pas lance,
// on retombe sur cette liste de base (degradation, cf. colonneAbsente).
const COLONNES_BASE =
  "copro_code, type, date_evenement, statut, confirme_le, confirme_par, outlook_event_id, outlook_boite";
const COLONNES = `${COLONNES_BASE}, salle_email, vehicule_email`;

type Row = {
  copro_code: string;
  type: "AG" | "CS";
  date_evenement: string;
  statut: "a_confirmer" | "confirme";
  confirme_le: string | null;
  confirme_par: string | null;
  outlook_event_id: string | null;
  outlook_boite: string | null;
  // Absentes tant que l'ALTER intranet_confirmations_evenement_ressources n'est pas lance.
  salle_email?: string | null;
  vehicule_email?: string | null;
};

// Colonne absente (ALTER pas encore lance) : code Postgres 42703, ou message explicite
// selon le chemin (PostgREST / cache de schema). Meme filet que le module reprise.
function colonneAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    /column .* does not exist|schema cache|could not find the .* column/i.test(error.message ?? "")
  );
}

function versDomaine(r: Row): ConfirmationEvenement {
  return {
    coproCode: r.copro_code,
    type: r.type,
    date: r.date_evenement,
    statut: r.statut,
    ...(r.confirme_le ? { confirmeLe: r.confirme_le } : {}),
    ...(r.confirme_par ? { confirmePar: r.confirme_par } : {}),
    ...(r.outlook_event_id ? { outlookEventId: r.outlook_event_id } : {}),
    ...(r.outlook_boite ? { outlookBoite: r.outlook_boite } : {}),
    ...(r.salle_email ? { salleEmail: r.salle_email } : {}),
    ...(r.vehicule_email ? { vehiculeEmail: r.vehicule_email } : {}),
  };
}

export class SupabaseConfirmationEvenementRepository implements ConfirmationEvenementRepository {
  async getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]> {
    if (codes.length === 0) return [];
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from(TABLE).select(COLONNES).in("copro_code", codes);
    if (error) {
      // Colonnes ressources absentes (ALTER pas lance) : on relit SANS elles, pour ne
      // pas faire disparaitre les dates. Autre erreur (table absente) -> feature inerte.
      if (colonneAbsente(error)) {
        const r = await supabase.from(TABLE).select(COLONNES_BASE).in("copro_code", codes);
        return r.error ? [] : (r.data as Row[]).map(versDomaine);
      }
      return [];
    }
    return (data as Row[]).map(versDomaine);
  }

  async get(coproCode: string): Promise<ConfirmationEvenement[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from(TABLE).select(COLONNES).eq("copro_code", coproCode);
    if (error) {
      if (colonneAbsente(error)) {
        const r = await supabase.from(TABLE).select(COLONNES_BASE).eq("copro_code", coproCode);
        return r.error ? [] : (r.data as Row[]).map(versDomaine);
      }
      return [];
    }
    return (data as Row[]).map(versDomaine);
  }

  async confirmer(coproCode: string, type: "AG" | "CS", date: string, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    // Erreur (table absente) avalee : ecriture no-op tant que le SQL n'est pas lance.
    await supabase.from(TABLE).upsert(
      {
        copro_code: coproCode,
        type,
        date_evenement: date,
        statut: "confirme",
        confirme_le: new Date().toISOString(),
        confirme_par: par,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "copro_code,type" },
    );
  }

  async proposer(coproCode: string, type: "AG" | "CS", date: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    // Reposer une date invalide la confirmation precedente (statut + traces remis a zero).
    // Les colonnes outlook_* ne sont pas touchees : la projection Outlook survit a la
    // replanification (l'evenement sera DEPLACE, pas recree).
    await supabase.from(TABLE).upsert(
      {
        copro_code: coproCode,
        type,
        date_evenement: date,
        statut: "a_confirmer",
        confirme_le: null,
        confirme_par: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "copro_code,type" },
    );
  }

  async enregistrerProjection(
    coproCode: string,
    type: "AG" | "CS",
    eventId: string | null,
    boite: string | null,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    // UPDATE cible (pas d'upsert) : une projection sans ligne de confirmation n'a pas
    // de sens. Erreur (table absente) avalee, comme les autres ecritures.
    await supabase
      .from(TABLE)
      .update({
        outlook_event_id: eventId,
        outlook_boite: boite,
        updated_at: new Date().toISOString(),
      })
      .eq("copro_code", coproCode)
      .eq("type", type);
  }

  async enregistrerRessources(
    coproCode: string,
    type: "AG" | "CS",
    salleEmail: string | null,
    vehiculeEmail: string | null,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    // UPDATE cible (comme enregistrerProjection) : une ressource sans ligne de
    // confirmation n'a pas de sens.
    const { error } = await supabase
      .from(TABLE)
      .update({
        salle_email: salleEmail,
        vehicule_email: vehiculeEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("copro_code", coproCode)
      .eq("type", type);
    // Colonnes absentes (ALTER pas lance) : on ne peut pas persister les ressources,
    // mais la date/heure/statut restent la source -> no-op silencieux (degrade propre).
    // Toute autre erreur (table absente) est deja avalee par les autres ecritures.
    if (error && colonneAbsente(error)) return;
  }
}
