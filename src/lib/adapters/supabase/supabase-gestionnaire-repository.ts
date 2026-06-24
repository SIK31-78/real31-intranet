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
    // On collecte les managers ET les assistants (les deux colonnes d'equipe) : le
    // selecteur dev-login (impersonation super-admin) doit pouvoir incarner un assistant
    // pour tester son perimetre, pas seulement un gestionnaire.
    const { data: copros } = await supabase
      .from("Copropriete")
      .select("managerId, assistantId");
    const ids = [
      ...new Set(
        ((copros as { managerId: string | null; assistantId: string | null }[] | null) ?? [])
          .flatMap((c) => [c.managerId, c.assistantId])
          .filter((id): id is string => Boolean(id)),
      ),
    ];
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

  async findByEmail(email: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    // ilike sans joker = egalite insensible a la casse (l'email Entra peut differer).
    const { data } = await supabase
      .from("User")
      .select("id, name, initials")
      .ilike("email", email)
      .maybeSingle();
    return data ? toGestionnaire(data as UserRow) : null;
  }
}
