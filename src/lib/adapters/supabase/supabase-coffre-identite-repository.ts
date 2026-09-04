// Adapter Supabase : annuaire + identite crypto du coffre (base patron,
// service_role). Tables intranet_pm_user / intranet_pm_user_service /
// intranet_pm_user_unlock. Ne stocke que du chiffre / des cles publiques.

import type { CoffreIdentiteRepository, NouveauCollaborateur } from "@/lib/ports/coffre-identite-repository";
import type {
  Collaborateur,
  ClePubliqueMembre,
  CollaborateurAnnuaire,
  ServiceOrg,
  Deverrouillage,
  MethodeDeverrouillage,
  BlobChiffreStocke,
} from "@/lib/domain/coffre";
import { createSupabasePublicClient } from "./public-client";

type UserRow = {
  id: string;
  azure_oid: string;
  email: string;
  display_name: string | null;
  agency_id: string | null;
  is_admin: boolean;
};
type UnlockRow = {
  id: string;
  method: string;
  label: string | null;
  wrapped_private_key: BlobChiffreStocke;
  params: Record<string, unknown>;
};

async function serviceIds(supabase: ReturnType<typeof createSupabasePublicClient>, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("intranet_pm_user_service")
    .select("service_id")
    .eq("user_id", userId);
  if (error) throw new Error(`Lecture pm_user_service : ${error.message}`);
  return ((data as { service_id: string }[] | null) ?? []).map((r) => r.service_id);
}

function toCollaborateur(r: UserRow, services: string[]): Collaborateur {
  return {
    id: r.id,
    azureOid: r.azure_oid,
    email: r.email,
    serviceIds: services,
    estAdmin: r.is_admin,
    ...(r.display_name ? { nomComplet: r.display_name } : {}),
    ...(r.agency_id ? { agenceId: r.agency_id } : {}),
  };
}

export class SupabaseCoffreIdentiteRepository implements CoffreIdentiteRepository {
  async trouverParAzureOid(azureOid: string): Promise<Collaborateur | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .select("id, azure_oid, email, display_name, agency_id, is_admin")
      .eq("azure_oid", azureOid)
      .maybeSingle();
    if (error) throw new Error(`Lecture pm_user : ${error.message}`);
    if (!data) return null;
    const row = data as UserRow;
    return toCollaborateur(row, await serviceIds(supabase, row.id));
  }

  async creer(nouveau: NouveauCollaborateur): Promise<Collaborateur> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .insert({
        azure_oid: nouveau.azureOid,
        email: nouveau.email,
        display_name: nouveau.nomComplet ?? null,
        agency_id: nouveau.agenceId ?? null,
        public_key: nouveau.publicKey,
      })
      .select("id, azure_oid, email, display_name, agency_id, is_admin")
      .single();
    if (error) throw new Error(`Creation pm_user : ${error.message}`);
    return toCollaborateur(data as UserRow, []);
  }

  async getClePublique(userId: string): Promise<ClePubliqueMembre | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .select("public_key")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(`Lecture cle publique : ${error.message}`);
    return data ? { userId, publicKey: (data as { public_key: string }).public_key } : null;
  }

  async listerClesPubliques(userIds: string[]): Promise<ClePubliqueMembre[]> {
    if (userIds.length === 0) return [];
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .select("id, public_key")
      .in("id", userIds);
    if (error) throw new Error(`Lecture cles publiques : ${error.message}`);
    return ((data as { id: string; public_key: string }[] | null) ?? []).map((r) => ({
      userId: r.id,
      publicKey: r.public_key,
    }));
  }

  async listerCollaborateurs(): Promise<CollaborateurAnnuaire[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .select("id, email, display_name, public_key, is_admin");
    if (error) throw new Error(`Lecture annuaire pm_user : ${error.message}`);
    type Row = { id: string; email: string; display_name: string | null; public_key: string; is_admin: boolean };
    return ((data as Row[] | null) ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      publicKey: r.public_key,
      estAdmin: r.is_admin,
      ...(r.display_name ? { nomComplet: r.display_name } : {}),
    }));
  }

  async compterCollaborateurs(): Promise<number> {
    const supabase = createSupabasePublicClient();
    const { count, error } = await supabase
      .from("intranet_pm_user")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(`Comptage pm_user : ${error.message}`);
    return count ?? 0;
  }

  async definirAdmin(userId: string, estAdmin: boolean): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user").update({ is_admin: estAdmin }).eq("id", userId);
    if (error) throw new Error(`Maj is_admin pm_user : ${error.message}`);
  }

  async remplacerClePublique(userId: string, publicKey: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user").update({ public_key: publicKey }).eq("id", userId);
    if (error) throw new Error(`Maj public_key pm_user : ${error.message}`);
  }

  async listerServices(): Promise<ServiceOrg[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("intranet_pm_service").select("id, name").order("name");
    if (error) throw new Error(`Lecture pm_service : ${error.message}`);
    return ((data as { id: string; name: string }[] | null) ?? []).map((r) => ({ id: r.id, nom: r.name }));
  }

  async listerDeverrouillages(userId: string): Promise<Deverrouillage[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user_unlock")
      .select("id, method, label, wrapped_private_key, params")
      .eq("user_id", userId);
    if (error) throw new Error(`Lecture pm_user_unlock : ${error.message}`);
    return ((data as UnlockRow[] | null) ?? []).map((r) => ({
      id: r.id,
      method: r.method as MethodeDeverrouillage,
      wrappedPrivateKey: r.wrapped_private_key,
      params: r.params,
      ...(r.label ? { label: r.label } : {}),
    }));
  }

  async ajouterDeverrouillage(
    userId: string,
    method: MethodeDeverrouillage,
    wrappedPrivateKey: BlobChiffreStocke,
    params: Record<string, unknown>,
    label?: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user_unlock").insert({
      user_id: userId,
      method,
      label: label ?? null,
      wrapped_private_key: wrappedPrivateKey,
      params,
    });
    if (error) throw new Error(`Ajout pm_user_unlock : ${error.message}`);
  }

  // Changement de mot de passe maitre : on remplace la ligne de la methode par
  // la nouvelle (meme cle privee, re-enrobee cote client). On supprime d'abord :
  // laisser deux lignes "master_password" rendrait l'ancien mot de passe encore
  // valide, donc le changement inoperant.
  async remplacerDeverrouillage(
    userId: string,
    method: MethodeDeverrouillage,
    wrappedPrivateKey: BlobChiffreStocke,
    params: Record<string, unknown>,
    label?: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error: delErr } = await supabase
      .from("intranet_pm_user_unlock")
      .delete()
      .eq("user_id", userId)
      .eq("method", method);
    if (delErr) throw new Error(`Remplacement pm_user_unlock (purge) : ${delErr.message}`);
    const { error } = await supabase.from("intranet_pm_user_unlock").insert({
      user_id: userId,
      method,
      label: label ?? null,
      wrapped_private_key: wrappedPrivateKey,
      params,
    });
    if (error) throw new Error(`Remplacement pm_user_unlock : ${error.message}`);
  }

  async supprimerDeverrouillages(userId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user_unlock").delete().eq("user_id", userId);
    if (error) throw new Error(`Purge pm_user_unlock : ${error.message}`);
  }

  async supprimerDeverrouillage(deverrouillageId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user_unlock").delete().eq("id", deverrouillageId);
    if (error) throw new Error(`Suppression pm_user_unlock : ${error.message}`);
  }
}
