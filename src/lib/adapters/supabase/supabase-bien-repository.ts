// Adapter Supabase des biens hors syndic (table intranet_bien, ADR-049). Service role, RLS
// sans policy : le cloisonnement (agence x activite) est applique par les services.

import type { ActiviteBien, BienHorsSyndic, ProprietaireBien, SourceBien, TypeBien } from "@/lib/domain/bien";
import type { BienRepository } from "@/lib/ports/bien-repository";
import { createSupabasePublicClient } from "./public-client";

export type BienRow = {
  id: string;
  agence_code: string;
  activite: ActiviteBien;
  reference: string;
  type: TypeBien;
  libelle: string | null;
  numero_voie: string | null;
  type_voie: string | null;
  nom_voie: string | null;
  complement: string | null;
  code_postal: string | null;
  ville: string | null;
  digicode: string | null;
  proprietaire_nom: string | null;
  proprietaire: ProprietaireBien | null;
  note: string | null;
  actif: boolean | null;
  source: SourceBien;
  source_ref: string | null;
};

const T_BIEN = "intranet_bien";
export const COLS_BIEN =
  "id, agence_code, activite, reference, type, libelle, numero_voie, type_voie, nom_voie, complement, code_postal, ville, digicode, proprietaire_nom, proprietaire, note, actif, source, source_ref";

function sansVide(o: Record<string, string | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => Boolean(e[1]?.trim())));
}

export function bienVersDomaine(r: BienRow): BienHorsSyndic {
  const proprietaire = r.proprietaire?.nom ? r.proprietaire : r.proprietaire_nom ? { nom: r.proprietaire_nom } : undefined;
  return {
    id: r.id,
    agenceCode: r.agence_code,
    activite: r.activite,
    reference: r.reference,
    type: r.type,
    libelle: r.libelle ?? "",
    adresse: sansVide({
      numeroVoie: r.numero_voie,
      typeVoie: r.type_voie,
      nomVoie: r.nom_voie,
      complement: r.complement,
      codePostal: r.code_postal,
      ville: r.ville,
    }),
    ...(r.digicode ? { digicode: r.digicode } : {}),
    ...(proprietaire ? { proprietaire } : {}),
    ...(r.note ? { note: r.note } : {}),
    actif: r.actif !== false,
    source: r.source,
    ...(r.source_ref ? { sourceRef: r.source_ref } : {}),
  };
}

export class SupabaseBienRepository implements BienRepository {
  async lister(f: { agenceCode?: string; inclureInactifs?: boolean } = {}): Promise<BienHorsSyndic[]> {
    const sb = createSupabasePublicClient();
    let q = sb.from(T_BIEN).select(COLS_BIEN).order("reference");
    if (f.agenceCode) q = q.eq("agence_code", f.agenceCode.toUpperCase());
    if (!f.inclureInactifs) q = q.eq("actif", true);
    const { data, error } = await q;
    if (error) {
      console.warn(`[biens] lecture : ${error.message}`);
      return [];
    }
    return ((data ?? []) as BienRow[]).map(bienVersDomaine);
  }

  async get(id: string): Promise<BienHorsSyndic | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_BIEN).select(COLS_BIEN).eq("id", id).maybeSingle();
    if (error) throw new Error(`Bien ${id} : ${error.message}`);
    return data ? bienVersDomaine(data as BienRow) : null;
  }
}
