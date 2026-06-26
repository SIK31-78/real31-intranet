// Adapter Supabase de l'annuaire Crypto (intranet_crypto_contacts) : lookup email ->
// copro en lot, via service_role. Les emails sont stockes EN MINUSCULES a l'import,
// donc la requete compare en minuscules. Degrade proprement si la table n'existe pas
// encore (avant l'import) -> aucune attribution par contact.

import type { CryptoContactsProvider } from "@/lib/ports/crypto-contacts-provider";
import { createSupabasePublicClient } from "./public-client";

const TABLE = "intranet_crypto_contacts";

export class SupabaseCryptoContactsRepository implements CryptoContactsProvider {
  async coprosPourEmails(emails: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const uniques = [...new Set(emails.map((e) => (e || "").toLowerCase().trim()).filter(Boolean))];
    if (uniques.length === 0) return out;
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(TABLE).select("email, copro_code").in("email", uniques);
    if (error) {
      // Table pas encore creee/importee : on degrade (pas d'attribution par contact).
      return out;
    }
    for (const r of (data as { email: string; copro_code: string }[] | null) ?? []) {
      const k = (r.email || "").toLowerCase();
      (out.get(k) ?? out.set(k, []).get(k)!).push(r.copro_code);
    }
    return out;
  }
}
