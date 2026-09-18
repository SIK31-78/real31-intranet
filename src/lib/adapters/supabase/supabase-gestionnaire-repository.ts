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

/**
 * Les collaborateurs partis (intranet_collaborateur.depart_le renseigne et passe) : hors
 * selecteurs et listes. Table absente = personne n'est parti (degradation propre).
 */
async function idsPartis(supabase: ReturnType<typeof createSupabasePublicClient>): Promise<Set<string>> {
  const { data, error } = await supabase.from("intranet_collaborateur").select("user_id, depart_le").not("depart_le", "is", null);
  if (error || !data) return new Set();
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return new Set((data as { user_id: string; depart_le: string }[]).filter((r) => r.depart_le <= aujourdHui).map((r) => r.user_id));
}

/** Les habilitations en cours d'un collaborateur, sous la forme "type:agence". */
async function habilitationsDe(supabase: ReturnType<typeof createSupabasePublicClient>, userId: string): Promise<string[]> {
  const { data, error } = await supabase.from("intranet_habilitation").select("habilitation, agence, depuis, jusqua").eq("user_id", userId);
  if (error || !data) return [];
  const aujourdHui = new Date().toISOString().slice(0, 10);
  return (data as { habilitation: string; agence: string | null; depuis: string; jusqua: string | null }[])
    .filter((h) => h.depuis <= aujourdHui && (!h.jusqua || h.jusqua >= aujourdHui))
    .map((h) => (h.agence ? `${h.habilitation}:${h.agence}` : h.habilitation));
}

async function avecHabilitations(supabase: ReturnType<typeof createSupabasePublicClient>, g: Gestionnaire): Promise<Gestionnaire> {
  const habilitations = await habilitationsDe(supabase, g.id);
  return habilitations.length > 0 ? { ...g, habilitations } : g;
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
    const [{ data: users }, partis] = await Promise.all([supabase.from("User").select(USER_COLS).in("id", ids), idsPartis(supabase)]);
    return ((users as UserRow[] | null) ?? [])
      .filter((u) => !partis.has(u.id))
      .map(toGestionnaire)
      .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet));
  }

  async listImpersonables(): Promise<Gestionnaire[]> {
    // Impersonation dev-login = TOUT le cabinet encore present (Sekou, 18/09/2026) : depuis
    // que la vue hors syndic existe, il faut pouvoir incarner Neis (vente) ou la gestion
    // locative, pas seulement les gens a portefeuille et les comptables. On NE touche PAS
    // list() : elle reste la liste des collaborateurs a portefeuille (AG, filtres).
    return this.listTous();
  }

  async listTous(): Promise<Gestionnaire[]> {
    const supabase = createSupabasePublicClient();
    const [{ data }, partis] = await Promise.all([supabase.from("User").select(USER_COLS).order("name"), idsPartis(supabase)]);
    return ((data as UserRow[] | null) ?? [])
      .filter((u) => !partis.has(u.id))
      .map(toGestionnaire)
      .sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, "fr"));
  }

  async findById(id: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    const { data } = await supabase
      .from("User")
      .select(USER_COLS)
      .eq("id", id)
      .maybeSingle();
    return data ? avecHabilitations(supabase, toGestionnaire(data as UserRow)) : null;
  }

  async findByEmail(email: string): Promise<Gestionnaire | null> {
    const supabase = createSupabasePublicClient();
    // ilike sans joker = egalite insensible a la casse (l'email Entra peut differer).
    const { data } = await supabase
      .from("User")
      .select(USER_COLS)
      .ilike("email", email)
      .maybeSingle();
    return data ? avecHabilitations(supabase, toGestionnaire(data as UserRow)) : null;
  }
}
