// Adapter Supabase : coffres, appartenances et secrets chiffres (base patron,
// service_role). Tables intranet_pm_vault / intranet_pm_membership /
// intranet_pm_secret. Le serveur ne voit que des blobs opaques (zero-knowledge).

import type { CoffreRepository, NouveauCoffre, PremierMembre } from "@/lib/ports/coffre-repository";
import type {
  Coffre,
  CoffreAccessible,
  Membership,
  SecretChiffre,
  BlobChiffreStocke,
  CleEnrobeeMembre,
  ScopeCoffre,
  Sensibilite,
  RoleMembre,
  EntreeAudit,
  ActionAudit,
} from "@/lib/domain/coffre";
import { createSupabasePublicClient } from "./public-client";

type VaultRow = {
  id: string;
  scope: string;
  name: string;
  sensitivity: string;
  agency_id: string | null;
  service_id: string | null;
  owner_user_id: string | null;
};
type MembershipRow = {
  vault_id: string;
  user_id: string;
  role: string;
  wrapped_vault_key: CleEnrobeeMembre;
  granted_by: string | null;
};
type SecretRow = {
  id: string;
  vault_id: string;
  blob: BlobChiffreStocke;
  crypto_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function toCoffre(r: VaultRow): Coffre {
  return {
    id: r.id,
    scope: r.scope as ScopeCoffre,
    nom: r.name,
    sensibilite: r.sensitivity as Sensibilite,
    ...(r.agency_id ? { agenceId: r.agency_id } : {}),
    ...(r.service_id ? { serviceId: r.service_id } : {}),
    ...(r.owner_user_id ? { ownerId: r.owner_user_id } : {}),
  };
}
function toMembership(r: MembershipRow): Membership {
  return {
    coffreId: r.vault_id,
    userId: r.user_id,
    role: r.role as RoleMembre,
    wrappedVaultKey: r.wrapped_vault_key,
    ...(r.granted_by ? { grantedBy: r.granted_by } : {}),
  };
}

export class SupabaseCoffreRepository implements CoffreRepository {
  async listerCoffresAccessibles(userId: string): Promise<CoffreAccessible[]> {
    const supabase = createSupabasePublicClient();
    const { data: mData, error: mErr } = await supabase
      .from("intranet_pm_membership")
      .select("vault_id, user_id, role, wrapped_vault_key, granted_by")
      .eq("user_id", userId);
    if (mErr) throw new Error(`Lecture pm_membership : ${mErr.message}`);
    const memberships = (mData as MembershipRow[] | null) ?? [];
    if (memberships.length === 0) return [];

    const { data: vData, error: vErr } = await supabase
      .from("intranet_pm_vault")
      .select("id, scope, name, sensitivity, agency_id, service_id, owner_user_id")
      .in("id", memberships.map((m) => m.vault_id));
    if (vErr) throw new Error(`Lecture pm_vault : ${vErr.message}`);
    const coffres = new Map(((vData as VaultRow[] | null) ?? []).map((v) => [v.id, toCoffre(v)]));

    return memberships
      .map((m) => {
        const coffre = coffres.get(m.vault_id);
        return coffre ? { ...coffre, role: m.role as RoleMembre, wrappedVaultKey: m.wrapped_vault_key } : null;
      })
      .filter((x): x is CoffreAccessible => x !== null);
  }

  async listerCoffresPersonnels(userId: string): Promise<Coffre[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_vault")
      .select("id, scope, name, sensitivity, agency_id, service_id, owner_user_id")
      .eq("scope", "personal")
      .eq("owner_user_id", userId);
    if (error) throw new Error(`Lecture coffres persos : ${error.message}`);
    return ((data as VaultRow[] | null) ?? []).map(toCoffre);
  }

  async creerCoffre(nouveau: NouveauCoffre, premierMembre: PremierMembre): Promise<string> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_vault")
      .insert({
        scope: nouveau.scope,
        name: nouveau.nom,
        sensitivity: nouveau.sensibilite ?? "standard",
        agency_id: nouveau.agenceId ?? null,
        service_id: nouveau.serviceId ?? null,
        owner_user_id: nouveau.ownerId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(`Creation pm_vault : ${error.message}`);
    const coffreId = (data as { id: string }).id;

    const { error: mErr } = await supabase.from("intranet_pm_membership").insert({
      vault_id: coffreId,
      user_id: premierMembre.userId,
      role: "admin",
      wrapped_vault_key: premierMembre.wrappedVaultKey,
      granted_by: premierMembre.userId,
    });
    if (mErr) throw new Error(`Creation membership admin : ${mErr.message}`);
    return coffreId;
  }

  // Les FK secrets / memberships / audit sont en ON DELETE CASCADE : supprimer
  // le coffre emporte son contenu (cf. supabase/sql/intranet_pm_coffre.sql).
  async supprimerCoffre(coffreId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_vault").delete().eq("id", coffreId);
    if (error) throw new Error(`Suppression pm_vault : ${error.message}`);
  }

  async listerMemberships(coffreId: string): Promise<Membership[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_membership")
      .select("vault_id, user_id, role, wrapped_vault_key, granted_by")
      .eq("vault_id", coffreId);
    if (error) throw new Error(`Lecture memberships : ${error.message}`);
    return ((data as MembershipRow[] | null) ?? []).map(toMembership);
  }

  async ajouterMembership(membership: Membership): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_membership").upsert(
      {
        vault_id: membership.coffreId,
        user_id: membership.userId,
        role: membership.role,
        wrapped_vault_key: membership.wrappedVaultKey,
        granted_by: membership.grantedBy ?? null,
      },
      { onConflict: "vault_id,user_id" },
    );
    if (error) throw new Error(`Ajout membership : ${error.message}`);
  }

  async retirerMembership(coffreId: string, userId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_pm_membership")
      .delete()
      .eq("vault_id", coffreId)
      .eq("user_id", userId);
    if (error) throw new Error(`Retrait membership : ${error.message}`);
  }

  async listerSecrets(coffreId: string): Promise<SecretChiffre[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_secret")
      .select("id, vault_id, blob, crypto_version, created_by, created_at, updated_at")
      .eq("vault_id", coffreId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Lecture pm_secret : ${error.message}`);
    return ((data as SecretRow[] | null) ?? []).map((r) => ({
      id: r.id,
      coffreId: r.vault_id,
      blob: r.blob,
      cryptoVersion: r.crypto_version,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...(r.created_by ? { createdBy: r.created_by } : {}),
    }));
  }

  async ajouterSecret(
    coffreId: string,
    blob: BlobChiffreStocke,
    cryptoVersion: number,
    createdBy?: string,
  ): Promise<string> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_secret")
      .insert({ vault_id: coffreId, blob, crypto_version: cryptoVersion, created_by: createdBy ?? null })
      .select("id")
      .single();
    if (error) throw new Error(`Ajout pm_secret : ${error.message}`);
    return (data as { id: string }).id;
  }

  async modifierSecret(
    coffreId: string,
    secretId: string,
    blob: BlobChiffreStocke,
    cryptoVersion: number,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_pm_secret")
      .update({ blob, crypto_version: cryptoVersion, updated_at: new Date().toISOString() })
      .eq("id", secretId)
      .eq("vault_id", coffreId);
    if (error) throw new Error(`Maj pm_secret : ${error.message}`);
  }

  async supprimerSecret(coffreId: string, secretId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_pm_secret")
      .delete()
      .eq("id", secretId)
      .eq("vault_id", coffreId);
    if (error) throw new Error(`Suppression pm_secret : ${error.message}`);
  }

  async ajouterSecrets(
    coffreId: string,
    items: { blob: BlobChiffreStocke; cryptoVersion: number }[],
    createdBy?: string,
  ): Promise<void> {
    if (items.length === 0) return;
    const supabase = createSupabasePublicClient();
    const rows = items.map((it) => ({
      vault_id: coffreId,
      blob: it.blob,
      crypto_version: it.cryptoVersion,
      created_by: createdBy ?? null,
    }));
    const { error } = await supabase.from("intranet_pm_secret").insert(rows);
    if (error) throw new Error(`Import pm_secret : ${error.message}`);
  }

  async journaliser(
    coffreId: string,
    userId: string,
    action: ActionAudit,
    secretId?: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase.from("intranet_pm_audit").insert({
      vault_id: coffreId,
      user_id: userId,
      action,
      secret_id: secretId ?? null,
      details: details ?? null,
    });
    if (error) throw new Error(`Ecriture pm_audit : ${error.message}`);
  }

  async listerAudit(coffreId: string, limite = 50): Promise<EntreeAudit[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_pm_audit")
      .select("id, vault_id, secret_id, user_id, action, details, created_at")
      .eq("vault_id", coffreId)
      .order("created_at", { ascending: false })
      .limit(limite);
    if (error) throw new Error(`Lecture pm_audit : ${error.message}`);
    type AuditRow = {
      id: string;
      vault_id: string;
      secret_id: string | null;
      user_id: string | null;
      action: string;
      details: Record<string, unknown> | null;
      created_at: string;
    };
    return ((data as AuditRow[] | null) ?? []).map((r) => ({
      id: r.id,
      coffreId: r.vault_id,
      action: r.action as ActionAudit,
      createdAt: r.created_at,
      ...(r.secret_id ? { secretId: r.secret_id } : {}),
      ...(r.user_id ? { userId: r.user_id } : {}),
      ...(r.details ? { details: r.details } : {}),
    }));
  }
}
