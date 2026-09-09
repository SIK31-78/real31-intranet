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
// Idem pour les colonnes OPTIONNELLES (ALTER pas lance) : `jeu` (reprise_dossier_jeu.sql) et
// `sortant` / `date_bascule` / `equipe` (reprise_dossier_suivi_equipe.sql, ADR-037) :
// lecture -> absentes, ecriture -> l'upsert est rejoue SANS la colonne manquante.

import type { Dossier, StatutDossier } from "@/lib/reprise/domain/dossier";
import { reconcilierEtapes } from "@/lib/reprise/domain/dossier";
import type { DossierRepository } from "@/lib/reprise/ports/dossier-repository";
import { createSupabasePublicClient } from "@/lib/adapters/supabase/public-client";

const TABLE = "reprise_dossier";

/** Colonnes de base (toujours presentes depuis reprise_dossier.sql). */
const COLONNES_BASE = "ref, nom_usuel, adresse, statut, etapes, compteurs, anomalies, journal";
/** Colonnes optionnelles (chacune creee par un ALTER a la main) que la LISTE doit charger. */
const COLONNES_SUIVI = ["sortant", "date_bascule", "equipe"] as const;
/** Toutes les colonnes optionnelles, degradables a l'ecriture. */
const COLONNES_OPTIONNELLES = ["jeu", ...COLONNES_SUIVI] as const;
type ColonneOptionnelle = (typeof COLONNES_OPTIONNELLES)[number];

/** true si l'erreur Supabase signale une table absente (table pas encore creee). */
function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

/**
 * true si l'erreur Supabase signale qu'une colonne n'existe pas (ALTER pas lance). Couvre le code
 * Postgres 42703 (undefined_column), PGRST204 et les messages PostgREST ("could not find the
 * 'jeu' column", schema cache).
 */
function colonneAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    (/column/i.test(error.message) && /does not exist/i.test(error.message)) ||
    /could not find the '\w+' column/i.test(error.message) ||
    /schema cache/i.test(error.message)
  );
}

/**
 * Nom de la colonne optionnelle manquante d'apres le message d'erreur, si identifiable :
 *   - Postgres : « column reprise_dossier.sortant does not exist »
 *   - PostgREST : « Could not find the 'equipe' column of 'reprise_dossier' in the schema cache »
 * undefined si le message ne la nomme pas (ou nomme une colonne qui n'est pas optionnelle).
 */
function colonneManquante(message: string): ColonneOptionnelle | undefined {
  const m =
    /column\s+(?:\w+\.)?(\w+)\s+does not exist/i.exec(message) ??
    /could not find the '(\w+)' column/i.exec(message);
  const nom = m?.[1];
  return nom && (COLONNES_OPTIONNELLES as readonly string[]).includes(nom) ? (nom as ColonneOptionnelle) : undefined;
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
  /** Colonnes de suivi d'equipe (ADR-037) : absentes tant que l'ALTER n'est pas passe. */
  sortant?: string | null;
  date_bascule?: string | null;
  equipe?: Dossier["equipe"] | null;
}

function versDossier(l: LigneDossier): Dossier {
  return {
    ref: l.ref,
    nomUsuel: l.nom_usuel,
    ...(l.adresse ? { adresse: l.adresse } : {}),
    statut: l.statut as StatutDossier,
    // Toujours reconcilie avec la checklist COURANTE (anciens codes R*, P/V/C, ad hoc...) : un
    // appelant qui lit le repo directement voit le meme dossier que via le service.
    etapes: reconcilierEtapes(l.etapes ?? []),
    compteurs: l.compteurs ?? {},
    anomalies: l.anomalies ?? [],
    journal: l.journal ?? [],
    ...(l.sortant ? { sortant: l.sortant } : {}),
    ...(l.date_bascule ? { dateBascule: String(l.date_bascule).slice(0, 10) } : {}),
    ...(l.equipe && typeof l.equipe === "object" ? { equipe: l.equipe } : {}),
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
    sortant: d.sortant ?? null,
    date_bascule: d.dateBascule ?? null,
    equipe: d.equipe ?? null,
    updated_at: new Date().toISOString(),
  };
}

export class DossierRepositorySupabase implements DossierRepository {
  async lister(): Promise<Dossier[]> {
    const sb = createSupabasePublicClient();
    // Colonnes explicites SANS jeu : la page liste ne l'utilise pas et jeu (jsonb) est
    // lourd (documents/donnees d'analyse). obtenir() ci-dessous continue de charger jeu.
    // Les colonnes de suivi d'equipe sont demandees ; si l'ALTER n'est pas passe (42703),
    // on rejoue la selection sur les colonnes de base.
    let { data, error } = await sb.from(TABLE).select(`${COLONNES_BASE}, ${COLONNES_SUIVI.join(", ")}`);
    if (error && colonneAbsente(error) && !tableAbsente(error)) {
      ({ data, error } = await sb.from(TABLE).select(COLONNES_BASE));
    }
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`Reprise lister dossiers : ${error.message}`);
    }
    return ((data as unknown as LigneDossier[] | null) ?? []).map(versDossier);
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
    let ligne: Record<string, unknown> = { ...versLigne(dossier) };
    // Une colonne optionnelle absente (ALTER pas lance) : on retire CELLE que l'erreur nomme et on
    // rejoue, pour que le reste du dossier persiste quand meme. Si le message ne la nomme pas, on
    // retire toutes les optionnelles d'un coup. Au plus une tentative par colonne optionnelle.
    for (let tentative = 0; tentative <= COLONNES_OPTIONNELLES.length; tentative++) {
      const { error } = await sb.from(TABLE).upsert(ligne, { onConflict: "ref" });
      if (!error) return;
      if (tableAbsente(error)) return; // table pas encore creee : no-op silencieux
      if (!colonneAbsente(error)) throw new Error(`Reprise sauver dossier : ${error.message}`);
      const nom = colonneManquante(error.message);
      const aRetirer: readonly string[] = nom ? [nom] : COLONNES_OPTIONNELLES;
      const restantes = aRetirer.filter((c) => c in ligne);
      if (restantes.length === 0) throw new Error(`Reprise sauver dossier : ${error.message}`);
      ligne = Object.fromEntries(Object.entries(ligne).filter(([k]) => !restantes.includes(k)));
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
