// Adapter Supabase du DossierRepository (module Reprise de copro). Une ligne par dossier
// dans public.reprise_dossier (base patron mutualisee) : colonnes structurees + JSONB pour
// les parties variables (etapes / compteurs / anomalies / journal). Le SDK
// @supabase/supabase-js est CONFINE ici (isolation hexagonale).
//
// Cloisonnement : une reprise concerne une copro PAS ENCORE dans le perimetre eStale, il
// n'y a donc pas de cloisonnement gestionnaire ici (cf. actions.ts du module reprise).
// Acces via service_role (bypass RLS) comme les autres tables natives de l'intranet.
//
// Degradation propre : si la table n'existe pas encore (42P01 / PGRST205 / schema cache),
// la lecture renvoie vide et l'ecriture est un no-op silencieux (pas de crash de page).
// Idem si la colonne jeu n'existe pas encore (ALTER pas lance) : lecture -> undefined,
// ecriture -> no-op silencieux, pour que l'analyse marche AVANT la migration.

import type { Dossier, StatutDossier } from "@/lib/reprise/domain/dossier";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { createSupabasePublicClient } from "@/lib/adapters/supabase/public-client";

const TABLE = "reprise_dossier";

/** true si l'erreur Supabase signale une table absente (table pas encore creee). */
function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

/**
 * true si l'erreur Supabase signale que la colonne jeu n'existe pas encore (ALTER pas
 * lance). Permet un no-op silencieux en ecriture pour que l'analyse marche AVANT la
 * migration reprise_dossier_jeu.sql. Couvre le code Postgres 42703 (undefined_column)
 * et les messages PostgREST ("could not find the 'jeu' column", schema cache).
 */
function colonneAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42703" ||
    (/column/i.test(error.message) && /does not exist/i.test(error.message)) ||
    /could not find the 'jeu' column/i.test(error.message) ||
    /schema cache/i.test(error.message)
  );
}

interface LigneDossier {
  ref: string;
  nom_usuel: string;
  adresse: string | null;
  statut: string;
  etapes: Dossier["etapes"] | null;
  compteurs: Dossier["compteurs"] | null;
  anomalies: string[] | null;
  journal: Dossier["journal"] | null;
  /** Peut etre absent si la colonne n'a pas encore ete creee (ALTER a la main). */
  jeu?: Dossier["jeu"] | null;
}

function versDossier(l: LigneDossier): Dossier {
  return {
    ref: l.ref,
    nomUsuel: l.nom_usuel,
    ...(l.adresse ? { adresse: l.adresse } : {}),
    statut: l.statut as StatutDossier,
    etapes: l.etapes ?? [],
    compteurs: l.compteurs ?? {},
    anomalies: l.anomalies ?? [],
    journal: l.journal ?? [],
    ...(l.jeu ? { jeu: l.jeu } : {}),
  };
}

function versLigne(d: Dossier): LigneDossier & { updated_at: string } {
  return {
    ref: d.ref,
    nom_usuel: d.nomUsuel,
    adresse: d.adresse ?? null,
    statut: d.statut,
    etapes: d.etapes,
    compteurs: d.compteurs,
    anomalies: d.anomalies,
    journal: d.journal,
    jeu: d.jeu ?? null,
    updated_at: new Date().toISOString(),
  };
}

export class DossierRepositorySupabase implements DossierRepository {
  async lister(): Promise<Dossier[]> {
    const sb = createSupabasePublicClient();
    // Colonnes explicites SANS jeu : la page liste ne l'utilise pas et jeu (jsonb) est
    // lourd (documents/donnees d'analyse). obtenir() ci-dessous continue de charger jeu.
    const { data, error } = await sb
      .from(TABLE)
      .select("ref, nom_usuel, adresse, statut, etapes, compteurs, anomalies, journal");
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Reprise lister dossiers : ${error.message}`);
    }
    return ((data as LigneDossier[] | null) ?? []).map(versDossier);
  }

  async obtenir(ref: string): Promise<Dossier | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("ref", ref).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw new Error(`Reprise obtenir dossier : ${error.message}`);
    }
    return data ? versDossier(data as LigneDossier) : null;
  }

  async sauver(dossier: Dossier): Promise<void> {
    const sb = createSupabasePublicClient();
    const ligne = versLigne(dossier);
    const { error } = await sb.from(TABLE).upsert(ligne, { onConflict: "ref" });
    if (!error) return;
    if (tableAbsente(error)) return; // table pas encore creee : no-op silencieux
    if (colonneAbsente(error)) {
      // Colonne jeu absente (ALTER pas lance) : on rejoue SANS jeu pour que le reste
      // (compteurs / anomalies / journal) persiste quand meme. Le jeu est simplement
      // ignore jusqu'a la migration -> l'analyse marche sans l'ALTER.
      const { jeu: _ignore, ...sansJeu } = ligne;
      void _ignore;
      const { error: err2 } = await sb.from(TABLE).upsert(sansJeu, { onConflict: "ref" });
      if (err2 && !tableAbsente(err2)) {
        throw new Error(`Reprise sauver dossier : ${err2.message}`);
      }
      return;
    }
    throw new Error(`Reprise sauver dossier : ${error.message}`);
  }

  async supprimer(ref: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).delete().eq("ref", ref);
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise supprimer dossier : ${error.message}`);
    }
  }
}
