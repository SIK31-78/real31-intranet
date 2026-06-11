// Adapter Supabase des gestionnaires : derive de public."Copropriete".managerId
// + public."User". Lecture seule via service_role.

import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { createSupabasePublicClient } from "./public-client";

type UserRow = { id: string; name: string; initials: string | null };

function toGestionnaire(u: UserRow): Gestionnaire {
  return {
    id: u.id,
    nomComplet: u.name,
    initiales: u.initials ?? u.name.slice(0, 2).toUpperCase(),
  };
}

export class SupabaseGestionnaireRepository implements GestionnaireRepository {
  async list(): Promise<Gestionnaire[]> {
    const supabase = createSupabasePublicClient();
    const { data: copros } = await supabase
      .from("Copropriete")
      .select("managerId")
      .not("managerId", "is", null);
    const ids = [...new Set(((copros as { managerId: string }[] | null) ?? []).map((c) => c.managerId))];
    if (ids.length === 0) return [];
    const { data: users } = await supabase
      .from("User")
      .select("id, name, initials")
      .in("id", ids);
    return ((users as UserRow[] | null) ?? [])
      .map(toGestionnaire)
      .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));
  }

  async findById(id: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("User")
      .select("id, name, initials")
      .eq("id", id)
      .maybeSingle();
    return data ? toGestionnaire(data as UserRow) : null;
  }
}
