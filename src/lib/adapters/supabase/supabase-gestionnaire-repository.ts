// Adapter Supabase des gestionnaires : derive de public."Copropriete".managerId
// + public."User". Lecture seule via service_role.

import type { GestionnaireRepository } from "@/lib/ports/gestionnaire-repository";
import type { Gestionnaire } from "@/lib/domain/gestionnaire";
import { createSupabasePublicClient } from "./public-client";

type UserRow = {
  id: string;
  name: string;
  initials: string | null;
  email: string | null;
  role: string | null;
  agencyId: string | null;
};

// Colonnes lues pour tous les acces gestionnaire (aligne les 4 SELECT ci-dessous).
// agencyId : cloisonnement par agence cote UI (cf. domain/gestionnaire).
const USER_COLS = "id, name, initials, email, role, agencyId";

function toGestionnaire(u: UserRow): Gestionnaire {
  return {
    id: u.id,
    nomComplet: u.name,
    initiales: u.initials ?? u.name.slice(0, 2).toUpperCase(),
    ...(u.email ? { email: u.email } : {}),
    // role brut public."User".role (enum App A) : lu pour deriver le role comptable
    // intranet (cf. lib/auth/roles). Le mapping vit dans le domaine, pas ici.
    ...(u.role ? { role: u.role } : {}),
    // Agence de la personne (id technique) : sert au filtrage par agence cote UI.
    ...(u.agencyId ? { agencyId: u.agencyId } : {}),
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
      .select(USER_COLS)
      .in("id", ids);
    return ((users as UserRow[] | null) ?? [])
      .map(toGestionnaire)
      .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));
  }

  async listImpersonables(): Promise<Gestionnaire[]> {
    // Impersonation dev-login = gestionnaires/assistants de copros (list) UNION les
    // comptables (role=COMPTABLE), qui n'ont pas de portefeuille et sont donc absents
    // de list(). On NE touche PAS list() : ajouter des comptables la-bas casserait le
    // selecteur de collaborateurs des AG et les filtres portefeuille.
    const supabase = createSupabasePublicClient();
    const [aPortefeuille, comptablesRes] = await Promise.all([
      this.list(),
      supabase
        .from("User")
        .select(USER_COLS)
        .eq("role", "COMPTABLE"),
    ]);
    const comptables = ((comptablesRes.data as UserRow[] | null) ?? []).map(toGestionnaire);
    const parId = new Map<string, Gestionnaire>();
    for (const g of [...aPortefeuille, ...comptables]) {
      if (!parId.has(g.id)) parId.set(g.id, g);
    }
    return [...parId.values()].sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));
  }

  async findById(id: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("User")
      .select(USER_COLS)
      .eq("id", id)
      .maybeSingle();
    return data ? toGestionnaire(data as UserRow) : null;
  }

  async findByEmail(email: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    // ilike sans joker = egalite insensible a la casse (l'email Entra peut differer).
    const { data } = await supabase
      .from("User")
      .select(USER_COLS)
      .ilike("email", email)
      .maybeSingle();
    return data ? toGestionnaire(data as UserRow) : null;
  }
}
