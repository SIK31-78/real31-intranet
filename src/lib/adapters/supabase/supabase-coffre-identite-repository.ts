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
    ...(r.display_name ? { nomComplet: r.display_name } : {}),
    ...(r.agency_id ? { agenceId: r.agency_id } : {}),
  };
}

export class SupabaseCoffreIdentiteRepository implements CoffreIdentiteRepository {
  async trouverParAzureOid(azureOid: string): Promise<Collaborateur | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_user")
      .select("id, azure_oid, email, display_name, agency_id")
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
      .select("id, azure_oid, email, display_name, agency_id")
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
      .select("id, email, display_name, public_key");
    if (error) throw new Error(`Lecture annuaire pm_user : ${error.message}`);
    return ((data as { id: string; email: string; display_name: string | null; public_key: string }[] | null) ?? []).map(
      (r) => ({ id: r.id, email: r.email, publicKey: r.public_key, ...(r.display_name ? { nomComplet: r.display_name } : {}) }),
    );
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

  async supprimerDeverrouillage(deverrouillageId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_user_unlock").delete().eq("id", deverrouillageId);
    if (error) throw new Error(`Suppression pm_user_unlock : ${error.message}`);
  }
}
