// Adapter Supabase de la confirmation des dates AG/CS (table native
// intranet_confirmations_evenement, base patron, service_role). Si la table n'existe
// pas encore (SQL pas lance), la fonctionnalite degrade proprement : lecture -> vide,
// ecriture -> no-op silencieux (l'app fonctionne comme avant).

import type { ConfirmationEvenement, ModeReunion } from "@/lib/domain/confirmation-evenement";
import type { ConfirmationEvenementRepository } from "@/lib/ports/confirmation-evenement-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_confirmations_evenement";
// Colonnes ajoutees en PLUSIEURS vagues d'ALTER separes (chaque feature peut etre
// deployee avant que son ALTER ne soit lance). La lecture retombe en cascade sur la
// vague precedente si une colonne manque (cf. lireEnCascade / colonneAbsente) :
//   BASE        : colonnes historiques (toujours presentes) ;
//   RESSOURCES  : + salle_email, vehicule_email (increment 4) ;
//   MODE        : + mode_reunion (increment 2, volet mode de reunion) ;
//   COLONNES    : + collaborateurs_emails (increment 4c, multi-collaborateurs).
const COLONNES_BASE =
  "copro_code, type, date_evenement, statut, confirme_le, confirme_par, outlook_event_id, outlook_boite";
const COLONNES_RESSOURCES = `${COLONNES_BASE}, salle_email, vehicule_email`;
const COLONNES_MODE = `${COLONNES_RESSOURCES}, mode_reunion`;
const COLONNES = `${COLONNES_MODE}, collaborateurs_emails`;

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
  // Absente tant que l'ALTER intranet_confirmations_evenement_mode n'est pas lance.
  mode_reunion?: string | null;
  // Absente tant que l'ALTER intranet_confirmations_evenement_collaborateurs n'est pas
  // lance. jsonb -> tableau JS (PostgREST) ; on tolere aussi une chaine JSON (defensif).
  collaborateurs_emails?: string[] | string | null;
};

// Colonne absente (ALTER pas encore lance) : code Postgres 42703, ou message explicite
// selon le chemin (PostgREST / cache de schema). Meme filet que le module reprise.
function colonneAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    /column .* does not exist|schema cache|could not find the .* column/i.test(error.message ?? "")
  );
}

/** Valeur de mode valide (liste fermee) : filtre les valeurs inattendues en base. */
function versMode(v: string | null | undefined): ModeReunion | undefined {
  return v === "visio" || v === "presentiel" || v === "hybride" ? v : undefined;
}

/**
 * Normalise la colonne collaborateurs_emails en tableau d'emails. jsonb -> tableau JS
 * direct ; une chaine JSON (cas defensif) est parsee. Ne garde que des chaines non
 * vides. Tableau vide / illisible -> undefined (aucun collaborateur).
 */
function versCollaborateurs(v: string[] | string | null | undefined): string[] | undefined {
  let brut: unknown = v;
  if (typeof v === "string") {
    try {
      brut = JSON.parse(v);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(brut)) return undefined;
  const emails = brut.filter((e): e is string => typeof e === "string" && e.trim().length > 0);
  return emails.length > 0 ? emails : undefined;
}

function versDomaine(r: Row): ConfirmationEvenement {
  const mode = versMode(r.mode_reunion);
  const collaborateurs = versCollaborateurs(r.collaborateurs_emails);
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
    ...(mode ? { modeReunion: mode } : {}),
    ...(collaborateurs ? { collaborateursEmails: collaborateurs } : {}),
  };
}

// Resultat brut d'un select PostgREST (data + error), quel que soit le filtre applique.
type Reponse = { data: unknown; error: { code?: string; message?: string } | null };

/**
 * Lit les lignes en essayant la liste de colonnes la plus complete (COLONNES) puis en
 * retombant, colonne manquante apres colonne manquante, sur RESSOURCES puis BASE. Ainsi
 * un ALTER partiellement applique (ex. ressources deployees mais mode pas encore) ne
 * fait JAMAIS disparaitre les dates : on relit juste avec moins de colonnes. Toute autre
 * erreur (table absente) -> feature inerte ([]).
 */
async function lireEnCascade(
  select: (colonnes: string) => PromiseLike<Reponse>,
): Promise<ConfirmationEvenement[]> {
  for (const colonnes of [COLONNES, COLONNES_MODE, COLONNES_RESSOURCES, COLONNES_BASE]) {
    const { data, error } = await select(colonnes);
    if (!error) return (data as Row[]).map(versDomaine);
    if (!colonneAbsente(error)) return []; // table absente / autre erreur -> inerte
  }
  return [];
}

export class SupabaseConfirmationEvenementRepository implements ConfirmationEvenementRepository {
  async getPourCopros(codes: string[]): Promise<ConfirmationEvenement[]> {
    if (codes.length === 0) return [];
    const supabase = createSupabasePublicClient();
    return lireEnCascade((colonnes) =>
      supabase.from(TABLE).select(colonnes).in("copro_code", codes),
    );
  }

  async get(coproCode: string): Promise<ConfirmationEvenement[]> {
    const supabase = createSupabasePublicClient();
    return lireEnCascade((colonnes) =>
      supabase.from(TABLE).select(colonnes).eq("copro_code", coproCode),
    );
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
  ): Promise<boolean> {
    const supabase = createSupabasePublicClient();
    // UPDATE cible (pas d'upsert) : une projection sans ligne de confirmation n'a pas
    // de sens. `.select()` -> RETURNING : on sait si une ligne a reellement ete mise a
    // jour (id memorise). Renvoie `false` si aucune ligne (row absente) ou erreur (table
    // absente) : l'appelant supprime alors l'evenement Graph orphelin (jamais de doublon).
    const { data, error } = await supabase
      .from(TABLE)
      .update({
        outlook_event_id: eventId,
        outlook_boite: boite,
        updated_at: new Date().toISOString(),
      })
      .eq("copro_code", coproCode)
      .eq("type", type)
      .select("copro_code");
    return !error && Array.isArray(data) && data.length > 0;
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

  async enregistrerModeReunion(
    coproCode: string,
    type: "AG" | "CS",
    mode: ModeReunion | null,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    // UPDATE cible SEPARE de enregistrerRessources : si la colonne mode_reunion n'est
    // pas encore deployee, seule cette ecriture-ci degrade (no-op) - la salle / le
    // vehicule, eux, sont persistes par leur propre UPDATE intact.
    const { error } = await supabase
      .from(TABLE)
      .update({ mode_reunion: mode, updated_at: new Date().toISOString() })
      .eq("copro_code", coproCode)
      .eq("type", type);
    if (error && colonneAbsente(error)) return; // colonne absente -> no-op (degrade propre)
  }

  async enregistrerCollaborateurs(
    coproCode: string,
    type: "AG" | "CS",
    emails: string[],
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    // UPDATE cible SEPARE (comme enregistrerModeReunion) : si la colonne
    // collaborateurs_emails n'est pas encore deployee, seule cette ecriture degrade
    // (no-op) - la salle / le mode restent persistes par leurs propres UPDATE. [] est
    // stocke tel quel (aucun collaborateur), jamais null : la liste vide EST l'etat cible.
    const { error } = await supabase
      .from(TABLE)
      .update({ collaborateurs_emails: emails, updated_at: new Date().toISOString() })
      .eq("copro_code", coproCode)
      .eq("type", type);
    if (error && colonneAbsente(error)) return; // colonne absente -> no-op (degrade propre)
  }
}
