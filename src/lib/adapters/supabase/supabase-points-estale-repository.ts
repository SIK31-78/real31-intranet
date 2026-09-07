// Adapter Supabase des points ESTALE (table intranet_points_estale).

import type { CategoriePointEstale, PointEstale, StatutPointEstale } from "@/lib/domain/points-estale";
import {
  PointsEstaleNonConfigureError,
  type PatchPointEstale,
  type PointsEstaleRepository,
} from "@/lib/ports/points-estale-repository";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_points_estale";
const COLS = "id, titre, detail, bloquant, categorie, statut, reponse, created_at, updated_at, resolu_at";

type Row = {
  id: string;
  titre: string;
  detail: string | null;
  bloquant: boolean;
  categorie: string;
  statut: string;
  reponse: string | null;
  created_at: string;
  updated_at: string | null;
  resolu_at: string | null;
};

function tableAbsente(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /schema cache|could not find the table/i.test(error.message);
}

function map(r: Row): PointEstale {
  return {
    id: r.id,
    titre: r.titre,
    bloquant: r.bloquant,
    categorie: r.categorie as CategoriePointEstale,
    statut: r.statut as StatutPointEstale,
    createdAt: r.created_at,
    ...(r.detail ? { detail: r.detail } : {}),
    ...(r.reponse ? { reponse: r.reponse } : {}),
    ...(r.updated_at ? { updatedAt: r.updated_at } : {}),
    ...(r.resolu_at ? { resoluAt: r.resolu_at } : {}),
  };
}

export class SupabasePointsEstaleRepository implements PointsEstaleRepository {
  async lister(): Promise<PointEstale[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).order("created_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) throw new PointsEstaleNonConfigureError();
      throw new Error(`lister points ESTALE : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }

  async creer(point: { titre: string; detail?: string; bloquant: boolean; categorie?: CategoriePointEstale }): Promise<PointEstale> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({ titre: point.titre, detail: point.detail ?? null, bloquant: point.bloquant, categorie: point.categorie ?? "produit" })
      .select(COLS)
      .single();
    if (error) {
      if (tableAbsente(error)) throw new PointsEstaleNonConfigureError();
      throw new Error(`creer point ESTALE : ${error.message}`);
    }
    return map(data as Row);
  }

  async patch(id: string, patch: PatchPointEstale): Promise<PointEstale | null> {
    const sb = createSupabasePublicClient();
    const maj: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.titre !== undefined) maj.titre = patch.titre;
    if (patch.detail !== undefined) maj.detail = patch.detail;
    if (patch.bloquant !== undefined) maj.bloquant = patch.bloquant;
    if (patch.categorie !== undefined) maj.categorie = patch.categorie;
    if (patch.reponse !== undefined) maj.reponse = patch.reponse;
    if (patch.statut !== undefined) {
      maj.statut = patch.statut;
      // resolu_at marque la fin de vie (resolu OU abandonne) ; il s'efface si on rouvre.
      maj.resolu_at = patch.statut === "resolu" || patch.statut === "abandonne" ? new Date().toISOString() : null;
    }
    const { data, error } = await sb.from(TABLE).update(maj).eq("id", id).select(COLS).maybeSingle();
    if (error) {
      if (tableAbsente(error)) throw new PointsEstaleNonConfigureError();
      throw new Error(`editer point ESTALE : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }
}
