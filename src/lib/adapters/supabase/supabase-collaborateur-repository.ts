// Adapter Supabase du module Collaborateurs : public."User" et public."Copropriete" (App A,
// le referentiel du patron) + intranet_collaborateur / intranet_habilitation. Les deux
// tables intranet peuvent manquer (SQL pas encore passe) : on degrade sans casser.

import type { CollaborateurRepository } from "@/lib/ports/collaborateur-repository";
import type { Collaborateur, EquipeCopro, Habilitation, NouveauCollaborateur, RoleEquipe, TypeHabilitation } from "@/lib/domain/collaborateur";
import { createSupabasePublicClient } from "./public-client";

type UserRow = { id: string; name: string; initials: string | null; email: string | null; role: string | null; agencyId: string | null; isActive: boolean | null; referentDirectorId: string | null };
type FicheRow = { user_id: string; arrivee_le: string | null; depart_le: string | null; note: string | null };
type HabRow = { id: string; user_id: string; habilitation: string; agence: string | null; depuis: string; jusqua: string | null };

const USER_COLS = "id, name, initials, email, role, agencyId, isActive, referentDirectorId";
const COLONNE_EQUIPE: Record<RoleEquipe, string> = { gestionnaire: "managerId", assistant: "assistantId", comptable: "accountantId" };

export class SupabaseCollaborateurRepository implements CollaborateurRepository {
  private async complements(supabase: ReturnType<typeof createSupabasePublicClient>) {
    const [fiches, habs, agences] = await Promise.all([
      supabase.from("intranet_collaborateur").select("user_id, arrivee_le, depart_le, note"),
      supabase.from("intranet_habilitation").select("id, user_id, habilitation, agence, depuis, jusqua"),
      supabase.from("Agency").select("id, name"),
    ]);
    const parUser = new Map<string, FicheRow>();
    for (const f of ((fiches.data ?? []) as FicheRow[])) parUser.set(f.user_id, f);
    const habsParUser = new Map<string, Habilitation[]>();
    for (const h of ((habs.data ?? []) as HabRow[])) {
      const liste = habsParUser.get(h.user_id) ?? [];
      liste.push({ id: h.id, type: h.habilitation as TypeHabilitation, ...(h.agence ? { agence: h.agence } : {}), depuisISO: h.depuis, ...(h.jusqua ? { jusquaISO: h.jusqua } : {}) });
      habsParUser.set(h.user_id, liste);
    }
    const codeAgence = new Map(((agences.data ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
    return { parUser, habsParUser, codeAgence };
  }

  private versDomaine(u: UserRow, c: Awaited<ReturnType<SupabaseCollaborateurRepository["complements"]>>): Collaborateur {
    const f = c.parUser.get(u.id);
    return {
      id: u.id,
      nomComplet: u.name,
      initiales: u.initials ?? u.name.slice(0, 2).toUpperCase(),
      ...(u.email ? { email: u.email } : {}),
      ...(u.role ? { roleTable: u.role } : {}),
      ...(u.agencyId ? { agenceId: u.agencyId } : {}),
      ...(u.agencyId && c.codeAgence.get(u.agencyId) ? { agenceCode: c.codeAgence.get(u.agencyId) } : {}),
      actif: u.isActive !== false,
      ...(u.referentDirectorId ? { referentDirectorId: u.referentDirectorId } : {}),
      ...(f?.arrivee_le ? { arriveeISO: f.arrivee_le } : {}),
      ...(f?.depart_le ? { departISO: f.depart_le } : {}),
      ...(f?.note ? { note: f.note } : {}),
      habilitations: c.habsParUser.get(u.id) ?? [],
    };
  }

  async listerTous(): Promise<Collaborateur[]> {
    const supabase = createSupabasePublicClient();
    const [{ data, error }, c] = await Promise.all([supabase.from("User").select(USER_COLS).order("name"), this.complements(supabase)]);
    if (error) throw new Error(`Lecture des collaborateurs : ${error.message}`);
    return ((data ?? []) as UserRow[]).map((u) => this.versDomaine(u, c)).sort((a, b) => a.nomComplet.localeCompare(b.nomComplet, "fr"));
  }

  async get(userId: string): Promise<Collaborateur | null> {
    const supabase = createSupabasePublicClient();
    const [{ data, error }, c] = await Promise.all([supabase.from("User").select(USER_COLS).eq("id", userId).maybeSingle(), this.complements(supabase)]);
    if (error) throw new Error(`Lecture du collaborateur : ${error.message}`);
    return data ? this.versDomaine(data as UserRow, c) : null;
  }

  async listerEquipes(): Promise<EquipeCopro[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("Copropriete").select("referenceCrypto, referenceEstale, name, status, managerId, assistantId, accountantId").limit(1000);
    if (error) throw new Error(`Lecture des équipes : ${error.message}`);
    return ((data ?? []) as { referenceCrypto: string | null; referenceEstale: string | null; name: string; status: string; managerId: string | null; assistantId: string | null; accountantId: string | null }[]).map((r) => ({
      code: r.referenceCrypto ?? r.referenceEstale ?? "?",
      nom: r.name,
      statut: r.status === "ACTIVE" ? "active" : "inactive",
      ...(r.managerId ? { managerId: r.managerId } : {}),
      ...(r.assistantId ? { assistantId: r.assistantId } : {}),
      ...(r.accountantId ? { accountantId: r.accountantId } : {}),
    }));
  }

  async creer(n: NouveauCollaborateur & { initiales: string; par: string }): Promise<string> {
    const supabase = createSupabasePublicClient();
    const id = crypto.randomUUID();
    const maintenant = new Date().toISOString();
    const { error } = await supabase.from("User").insert({
      id,
      email: n.email.trim().toLowerCase(),
      name: n.nomComplet.trim(),
      initials: n.initiales,
      role: n.roleTable,
      isActive: true,
      agencyId: n.agenceId ?? null,
      referentDirectorId: n.referentDirectorId ?? null,
      createdAt: maintenant,
      updatedAt: maintenant,
    });
    if (error) throw new Error(`Création de ${n.nomComplet} : ${error.message}`);
    const { error: e2 } = await supabase.from("intranet_collaborateur").upsert({ user_id: id, arrivee_le: n.arriveeISO ?? maintenant.slice(0, 10), note: n.note ?? null, maj_par: n.par, updated_at: maintenant }, { onConflict: "user_id" });
    if (e2) console.warn(`[collaborateurs] arrivée non notée : ${e2.message}`);
    return id;
  }

  async reaffecter(coproCode: string, role: RoleEquipe, userId: string | null): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("Copropriete")
      .update({ [COLONNE_EQUIPE[role]]: userId, updatedAt: new Date().toISOString() })
      .or(`referenceCrypto.eq.${coproCode},referenceEstale.eq.${coproCode}`)
      .select("referenceCrypto");
    if (error) throw new Error(`Réaffectation de ${coproCode} : ${error.message}`);
    if (!data || data.length === 0) throw new Error(`Réaffectation de ${coproCode} : copropriété introuvable.`);
  }

  async noterDepart(userId: string, departISO: string, note: string | undefined, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const maintenant = new Date().toISOString();
    const { error } = await supabase.from("intranet_collaborateur").upsert({ user_id: userId, depart_le: departISO, ...(note !== undefined ? { note } : {}), maj_par: par, updated_at: maintenant }, { onConflict: "user_id" });
    if (error) throw new Error(`Départ : ${error.message}`);
    // Le jour venu, la personne est inactive dans App A aussi (elle disparait des listes du patron).
    if (departISO <= maintenant.slice(0, 10)) {
      const { error: e2 } = await supabase.from("User").update({ isActive: false, updatedAt: maintenant }).eq("id", userId);
      if (e2) throw new Error(`Désactivation dans App A : ${e2.message}`);
    }
  }

  async annulerDepart(userId: string, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const maintenant = new Date().toISOString();
    await supabase.from("intranet_collaborateur").update({ depart_le: null, maj_par: par, updated_at: maintenant }).eq("user_id", userId);
    const { error } = await supabase.from("User").update({ isActive: true, updatedAt: maintenant }).eq("id", userId);
    if (error) throw new Error(`Réactivation dans App A : ${error.message}`);
  }

  async ajouterHabilitation(userId: string, type: TypeHabilitation, agence: string | undefined, par: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_habilitation").insert({ user_id: userId, habilitation: type, agence: agence ?? null, cree_par: par });
    if (error) throw new Error(`Habilitation : ${error.message}`);
  }

  async cloreHabilitation(id: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_habilitation").update({ jusqua: new Date().toISOString().slice(0, 10) }).eq("id", id);
    if (error) throw new Error(`Habilitation : ${error.message}`);
  }
}
