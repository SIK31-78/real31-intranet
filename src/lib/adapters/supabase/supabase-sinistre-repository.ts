// Adapter Supabase du module Sinistre (table native public.intranet_sinistres,
// service_role). L'agregat lourd (DossierState complet) est serialise dans la
// colonne jsonb `payload` ; quelques champs sont aussi projetes a plat (copro,
// date, statut...) pour les filtres.
//
// CLOISONNEMENT (service_role bypasse la RLS) : il est applique EN AMONT, dans la
// server action (qui a le droit d'importer les services coproAppartient /
// exigerPerimetre, contrairement a un adapter - cf. regle ESLint boundaries). Meme
// posture que supabase-mes-emails-etat-repository. La signature porte tout de meme
// `managerId` (contrat du port), conserve ici pour les futurs filtres SQL et pour
// rendre le contrat explicite cote appelant.
//
// TOLERANT si la table n'existe pas encore : get renvoie null ; creer/patch
// relancent SinistrePersistanceIndisponible, catchable cote action (aucun crash).

import type { SinistreRepository } from "@/lib/ports/sinistre-repository";
import { SinistrePersistanceIndisponible } from "@/lib/ports/sinistre-repository";
import type { DossierState } from "@/lib/domain/sinistre/types";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_sinistres";
const COLS =
  "id, reference_interne, copropriete_id, agence_id, date, statut, created_by, payload";

type Row = {
  id: string;
  reference_interne: string;
  copropriete_id: string | null;
  agence_id: string | null;
  date: string | null;
  statut: string | null;
  created_by: string | null;
  payload: DossierState;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

/** Colonnes plates derivees de l'agregat (le payload reste la source complete). */
function colonnesPlates(etat: DossierState): Record<string, unknown> {
  return {
    copropriete_id: etat.coproprieteId ?? null,
    agence_id: etat.agenceId ?? null,
    date: etat.date || null,
    statut: etat.statut,
    created_by: etat.gestionnaire?.initiales ?? null,
  };
}

export class SupabaseSinistreRepository implements SinistreRepository {
  async get(id: string, _managerId: string): Promise<DossierState | null> {
    void _managerId; // cloisonnement applique cote action (cf. en-tete)
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).eq("id", id).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw new Error(`get sinistre : ${error.message}`);
    }
    if (!data) return null;
    const row = data as Row;
    // L'id/reference cote serveur priment sur ce qui serait dans le payload.
    return { ...row.payload, id: row.id, referenceInterne: row.reference_interne };
  }

  async creer(input: {
    etat: DossierState;
    managerId: string;
  }): Promise<{ id: string; referenceInterne: string }> {
    const { etat } = input;
    const sb = createSupabasePublicClient();
    const plates = colonnesPlates(etat);

    // Reference serveur sequentielle par annee : SIN-<annee>-<NNNN>. NNNN derive
    // d'un count des references de l'annee + 1, collision-safe via la contrainte
    // UNIQUE (retry sur conflit, plusieurs creations concurrentes possibles).
    const annee = new Date().getFullYear();
    const MAX_RETRY = 5;
    let derniereErreur = "";
    for (let tentative = 0; tentative < MAX_RETRY; tentative++) {
      const reference = await this.referenceSuivante(sb, annee, tentative);
      const payload: DossierState = { ...etat, referenceInterne: reference };
      const { data, error } = await sb
        .from(TABLE)
        .insert({ ...plates, reference_interne: reference, payload })
        .select("id, reference_interne")
        .single();
      if (!error) {
        const r = data as { id: string; reference_interne: string };
        return { id: r.id, referenceInterne: r.reference_interne };
      }
      if (tableAbsente(error)) throw new SinistrePersistanceIndisponible();
      // 23505 = unique_violation : une autre creation a pris la reference -> on retente.
      if (error.code === "23505") {
        derniereErreur = error.message;
        continue;
      }
      throw new Error(`creer sinistre : ${error.message}`);
    }
    throw new Error(`creer sinistre : conflit de reference persistant (${derniereErreur}).`);
  }

  async patch(id: string, fields: Partial<DossierState>, managerId: string): Promise<void> {
    const sb = createSupabasePublicClient();
    // On relit le dossier pour fusionner dans le payload existant et recalculer les
    // colonnes plates. get renvoie null si la ligne n'existe pas -> no-op.
    const courant = await this.get(id, managerId);
    if (!courant) return;

    // L'id et la reference ne se patchent jamais par ce chemin (ils sont serveur).
    const { id: _id, referenceInterne: _ref, ...patchable } = fields;
    void _id;
    void _ref;
    const fusion: DossierState = { ...courant, ...patchable };

    const { error } = await sb
      .from(TABLE)
      .update({
        ...colonnesPlates(fusion),
        payload: fusion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      if (tableAbsente(error)) throw new SinistrePersistanceIndisponible();
      throw new Error(`maj sinistre : ${error.message}`);
    }
  }

  /**
   * Reference suivante pour l'annee : SIN-<annee>-<NNNN>. Base sur le count des
   * lignes de l'annee + 1 + le numero de tentative (decale en cas de collision).
   */
  private async referenceSuivante(
    sb: ReturnType<typeof createSupabasePublicClient>,
    annee: number,
    decalage: number,
  ): Promise<string> {
    const { count, error } = await sb
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .like("reference_interne", `SIN-${annee}-%`);
    if (error) {
      if (tableAbsente(error)) throw new SinistrePersistanceIndisponible();
      throw new Error(`reference sinistre : ${error.message}`);
    }
    const n = (count ?? 0) + 1 + decalage;
    return `SIN-${annee}-${String(n).padStart(4, "0")}`;
  }
}
