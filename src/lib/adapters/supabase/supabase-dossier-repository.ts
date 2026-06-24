// Adapter Supabase du module Dossiers (table native intranet_dossiers, service_role).
// Tolerant si la table n'existe pas encore (liste vide au lieu de crasher).

import type { CreationDossier, DossierRepository, PatchDossier } from "@/lib/ports/dossier-repository";
import type {
  Dossier,
  EtapeDossier,
  EvenementDossier,
  PorteeDossier,
  StatutDossier,
  TypeDossier,
} from "@/lib/domain/dossier";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_dossiers";
const COLS =
  "id, copropriete_id, type, portee, cible, titre, statut, origine, ag_date, numero_resolution, etapes, journal, ouvert_par, ouvert_at";

type Row = {
  id: string;
  copropriete_id: string;
  type: string;
  portee: string;
  cible: string | null;
  titre: string;
  statut: string;
  origine: string | null;
  ag_date: string | null;
  numero_resolution: string | null;
  etapes: EtapeDossier[] | null;
  journal: EvenementDossier[] | null;
  ouvert_par: string | null;
  ouvert_at: string;
};

function map(r: Row): Dossier {
  return {
    id: r.id,
    coproCode: r.copropriete_id,
    type: r.type as TypeDossier,
    portee: r.portee as PorteeDossier,
    titre: r.titre,
    statut: r.statut as StatutDossier,
    ouvertLe: r.ouvert_at,
    etapes: r.etapes ?? [],
    journal: r.journal ?? [],
    ...(r.cible ? { cible: r.cible } : {}),
    ...(r.origine ? { origine: r.origine } : {}),
    ...(r.ag_date ? { agDate: r.ag_date } : {}),
    ...(r.numero_resolution ? { numeroResolution: r.numero_resolution } : {}),
    ...(r.ouvert_par ? { ouvertPar: r.ouvert_par } : {}),
  };
}

function tableAbsente(error: { code?: string; message: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /schema cache|could not find the table/i.test(error.message)
  );
}

export class SupabaseDossierRepository implements DossierRepository {
  async listPourCopros(coproCodes: string[]): Promise<Dossier[]> {
    if (coproCodes.length === 0) return [];
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(COLS)
      .in("copropriete_id", coproCodes)
      .order("ouvert_at", { ascending: false });
    if (error) {
      if (tableAbsente(error)) return [];
      throw new Error(`list dossiers : ${error.message}`);
    }
    return (data as Row[]).map(map);
  }

  async get(id: string): Promise<Dossier | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select(COLS).eq("id", id).maybeSingle();
    if (error) {
      if (tableAbsente(error)) return null;
      throw new Error(`get dossier : ${error.message}`);
    }
    return data ? map(data as Row) : null;
  }

  async creer(input: CreationDossier): Promise<string> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(TABLE)
      .insert({
        copropriete_id: input.coproCode,
        type: input.type,
        portee: input.portee,
        cible: input.cible ?? null,
        titre: input.titre,
        origine: input.origine ?? null,
        etapes: input.etapes,
        journal: input.journal,
        ouvert_par: input.ouvertPar ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`creer dossier : ${error.message}`);
    return (data as { id: string }).id;
  }

  async patch(id: string, fields: PatchDossier): Promise<void> {
    const sb = createSupabasePublicClient();
    // agDate/numeroResolution -> colonnes snake_case ; le reste (etapes/journal/statut/
    // titre/cible) porte deja le nom de la colonne et passe tel quel.
    const { agDate, numeroResolution, ...rest } = fields;
    const update: Record<string, unknown> = {
      ...rest,
      updated_at: new Date().toISOString(),
    };
    if (agDate !== undefined) update.ag_date = agDate;
    if (numeroResolution !== undefined) update.numero_resolution = numeroResolution;
    const { error } = await sb.from(TABLE).update(update).eq("id", id);
    if (error) throw new Error(`maj dossier : ${error.message}`);
  }
}
