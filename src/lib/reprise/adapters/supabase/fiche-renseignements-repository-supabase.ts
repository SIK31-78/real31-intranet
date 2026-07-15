// Adapter Supabase du FicheRenseignementsRepository. Une ligne par fiche dans
// public.reprise_fiche_renseignements (base patron mutualisee) : cle composite
// (copro_code, owner_id), token/code HASHES, snapshot connu + donnees soumises en JSONB. Le
// SDK @supabase/supabase-js est CONFINE ici (isolation hexagonale). Acces via service_role
// (bypass RLS) comme les autres tables natives (cf. reprise_dossier).
//
// Degradation propre : si la table n'existe pas encore (42P01 / PGRST205 / schema cache), la
// lecture renvoie vide/null et l'ecriture est un no-op silencieux (pas de crash) - le module
// marche AVANT que le SQL soit execute (cf. supabase/sql/reprise_fiche_renseignements.sql).
//
// PII : token/code stockes HASHES uniquement ; snapshot + soumissions jamais logues.

import type {
  DonneesConnues,
  DonneesSoumises,
  FicheRenseignement,
  FicheStatut,
} from "@/lib/reprise/domain/fiche-renseignements";
import type { FicheRenseignementsRepository } from "@/lib/reprise/ports/fiche-renseignements-repository";
import { createSupabasePublicClient } from "@/lib/adapters/supabase/public-client";

const TABLE = "reprise_fiche_renseignements";

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

interface LigneFiche {
  copro_code: string;
  owner_id: string;
  token_hash: string;
  code_hash: string;
  statut: string;
  connues: DonneesConnues;
  soumises: DonneesSoumises | null;
  courrier_genere_at: string;
  soumis_at: string | null;
  valide_at: string | null;
  mail_envoye_at: string | null;
  derniere_relance_at: string | null;
  expires_at: string;
}

function versFiche(l: LigneFiche): FicheRenseignement {
  return {
    coproCode: l.copro_code,
    ownerId: l.owner_id,
    tokenHash: l.token_hash,
    codeHash: l.code_hash,
    statut: l.statut as FicheStatut,
    connues: l.connues,
    ...(l.soumises ? { soumises: l.soumises } : {}),
    courrierGenereAt: l.courrier_genere_at,
    ...(l.soumis_at ? { soumisAt: l.soumis_at } : {}),
    ...(l.valide_at ? { valideAt: l.valide_at } : {}),
    ...(l.mail_envoye_at ? { mailEnvoyeAt: l.mail_envoye_at } : {}),
    ...(l.derniere_relance_at ? { derniereRelanceAt: l.derniere_relance_at } : {}),
    expiresAt: l.expires_at,
  };
}

function versLigne(f: FicheRenseignement): LigneFiche {
  return {
    copro_code: f.coproCode,
    owner_id: f.ownerId,
    token_hash: f.tokenHash,
    code_hash: f.codeHash,
    statut: f.statut,
    connues: f.connues,
    soumises: f.soumises ?? null,
    courrier_genere_at: f.courrierGenereAt,
    soumis_at: f.soumisAt ?? null,
    valide_at: f.valideAt ?? null,
    mail_envoye_at: f.mailEnvoyeAt ?? null,
    derniere_relance_at: f.derniereRelanceAt ?? null,
    expires_at: f.expiresAt,
  };
}

export class FicheRenseignementsRepositorySupabase implements FicheRenseignementsRepository {
  async listerParDossier(coproCode: string): Promise<FicheRenseignement[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("copro_code", coproCode);
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Reprise lister fiches : ${error.message}`);
    }
    return ((data as LigneFiche[] | null) ?? []).map(versFiche);
  }

  async obtenirParTokenHash(tokenHash: string): Promise<FicheRenseignement | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select("*").eq("token_hash", tokenHash).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw new Error(`Reprise obtenir fiche : ${error.message}`);
    }
    return data ? versFiche(data as LigneFiche) : null;
  }

  async sauver(fiche: FicheRenseignement): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(TABLE)
      .upsert(versLigne(fiche), { onConflict: "copro_code,owner_id" });
    if (error && !tableAbsente(error)) {
      throw new Error(`Reprise sauver fiche : ${error.message}`);
    }
  }
}
