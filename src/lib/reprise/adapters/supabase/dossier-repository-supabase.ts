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

interface LigneDossier {
  ref: string;
  nom_usuel: string;
  adresse: string | null;
  statut: string;
  etapes: Dossier["etapes"] | null;
  compteurs: Dossier["compteurs"] | null;
  anomalies: string[] | null;
  journal: Dossier["journal"] | null;
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
    updated_at: new Date().toISOString(),
  };
}

export class DossierRepositorySupabase implements DossierRepository {
  async lister(): Promise<Dossier[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select("*");
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
    const { error } = await sb.from(TABLE).upsert(versLigne(dossier), { onConflict: "ref" });
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise sauver dossier : ${error.message}`);
    }
  }

  async supprimer(ref: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.from(TABLE).delete().eq("ref", ref);
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise supprimer dossier : ${error.message}`);
    }
  }
}
