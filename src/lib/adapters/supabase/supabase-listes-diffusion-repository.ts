// Adapter Supabase des listes de diffusion Crypto (intranet_listes_diffusion) : lookup
// de la liste "conseil syndical" d'une copro par sa reference normalisee, via service_role.
// Degrade proprement si la table n'existe pas encore (avant l'import) -> aucun destinataire.
//
// ECRITURE (remplacerListeCS) : rend la couche de SECOURS editable depuis l'intranet. La
// cascade des destinataires du mail CS garde eStale en priorite (cf. destinataires-conseil).

import type { ListesDiffusionProvider, ListeCSCopro } from "@/lib/ports/listes-diffusion-provider";
import { normaliserRefCopro } from "@/lib/domain/listes-diffusion";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_listes_diffusion";

/** Persistance de la liste de diffusion indisponible (table/colonne absente) : catchable
 *  cote server action pour afficher un message propre plutot que de crasher l'UI. */
export class ListesDiffusionPersistanceIndisponible extends Error {
  constructor() {
    super("Liste de diffusion : persistance indisponible (schema pas a jour).");
    this.name = "ListesDiffusionPersistanceIndisponible";
  }
}

// ATTENTION (piege deja paye ailleurs) : ne matcher QUE la table absente. Une COLONNE
// manquante (PGRST204, "could not find the 'edite_le' column ... in the schema cache")
// doit remonter, PAS devenir un no-op silencieux -> c'est un schema a corriger (le SQL
// intranet_listes_diffusion_edite.sql n'a pas ete lance), pas un etat attendu.
function tableAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export class SupabaseListesDiffusionRepository implements ListesDiffusionProvider {
  async listeCSPourCopro(coproCode: string): Promise<ListeCSCopro | null> {
    const code = normaliserRefCopro(coproCode);
    if (!code) return null;
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("copro_code, designation, emails")
      .eq("copro_code", code)
      .eq("type_liste", "conseil_syndical")
      .limit(1);
    if (error || !data || data.length === 0) {
      // Table pas encore creee / importee, ou aucune liste CS pour cette copro.
      return null;
    }
    const row = data[0] as { copro_code: string; designation: string; emails: string[] | null };
    const emails = (row.emails ?? []).filter(Boolean);
    if (emails.length === 0) return null;
    return { coproCode: row.copro_code, designation: row.designation, emails };
  }

  async remplacerListeCS(coproCode: string, emails: string[]): Promise<void> {
    const code = normaliserRefCopro(coproCode);
    if (!code) throw new Error("Reference copro vide.");
    const sb = createSupabasePublicClient();
    const now = new Date().toISOString();

    // 1. La ligne (copro_code, 'conseil_syndical') existe-t-elle deja ?
    const { data, error } = await sb
      .from(TABLE)
      .select("idref")
      .eq("copro_code", code)
      .eq("type_liste", "conseil_syndical")
      .limit(1);
    if (error) {
      if (tableAbsente(error)) throw new ListesDiffusionPersistanceIndisponible();
      throw new Error(`Liste de diffusion lecture : ${error.message}`);
    }

    if (data && data.length > 0) {
      // 2a. UPDATE de la ligne existante (garde son idref d'origine, Crypto ou synthetique).
      const idref = (data[0] as { idref: string }).idref;
      const { error: e } = await sb
        .from(TABLE)
        .update({ emails, edite_le: now, updated_at: now })
        .eq("idref", idref);
      if (e) {
        if (tableAbsente(e)) throw new ListesDiffusionPersistanceIndisponible();
        throw new Error(`Liste de diffusion ecriture : ${e.message}`);
      }
      return;
    }

    // 2b. INSERT : aucune ligne CS pour cette copro (copro jamais importee de Crypto ->
    // pas d'idref natif). La PK est idref, on forge donc une cle SYNTHETIQUE stable
    // "intranet:{copro}:conseil_syndical" : deterministe (pas de doublon au re-enregistrement,
    // le chemin UPDATE reprend la main ensuite) et hors de l'espace des idref Crypto
    // (jamais de collision avec un futur import du meme immeuble).
    const idref = `intranet:${code}:conseil_syndical`;
    const { error: e } = await sb.from(TABLE).insert({
      idref,
      copro_code: code,
      designation: `Conseil syndical - ${code} (intranet)`,
      type_liste: "conseil_syndical",
      emails,
      edite_le: now,
      updated_at: now,
    });
    if (e) {
      if (tableAbsente(e)) throw new ListesDiffusionPersistanceIndisponible();
      throw new Error(`Liste de diffusion ecriture : ${e.message}`);
    }
  }
}
