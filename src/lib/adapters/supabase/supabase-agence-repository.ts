// Adapter Supabase du referentiel des agences : lit public."Agency" (id, name) et
// mappe name -> code. Lecture seule (ADR-002). Seul cet adapter connait la forme
// Prisma ; le domaine et l'UI l'ignorent (ADR-001).
//
// Degradation propre : si la table n'existe pas (env sans la table Agency : 42P01 /
// PGRST205 / schema cache), on renvoie [] -> le cloisonnement par agence tombe en
// "pas de filtre" (on montre tout) au lieu de casser la fiche. ATTENTION (piege deja
// paye ailleurs) : ne matcher QUE la table absente. Une COLONNE manquante (PGRST204)
// doit THROW - c'est un schema a corriger, pas un etat attendu.

import type { AgenceRepository, Agence } from "@/lib/ports/agence-repository";
import { createSupabasePublicClient } from "./public-client";

type AgencyRow = { id: string; name: string | null };

function tableAbsente(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export class SupabaseAgenceRepository implements AgenceRepository {
  async listerAgences(): Promise<Agence[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("Agency").select("id, name");
    if (error) {
      if (tableAbsente(error)) return []; // table absente -> pas de filtre agence
      throw new Error(`Lecture public.Agency : ${error.message}`);
    }
    return ((data as AgencyRow[] | null) ?? [])
      .filter((r): r is { id: string; name: string } => Boolean(r.id && r.name))
      .map((r) => ({ id: r.id, code: r.name }));
  }
}
