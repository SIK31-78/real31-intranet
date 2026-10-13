// Contacts d'une copro depuis l'annuaire Crypto (intranet_crypto_annuaire), pour le
// compositeur. LECTURE SEULE (service_role : RLS activée sans policy). L'annuaire est keyé
// par le code CRYPTO (copro_code = referenceCrypto) ; on résout d'abord ce code depuis la
// référence affichée (ESTALE ou Crypto) via la table Copropriete. Cache module 10 min.

import type { ContactCopro } from "@/lib/domain/mes-emails-composition";
import type { ContactsCoproProvider } from "@/lib/ports/contacts-copro-provider";
import { createSupabasePublicClient } from "./public-client";

const TTL_MS = 10 * 60 * 1000;
const ORDRE_QUALITE: Record<string, number> = { conseil_syndical: 0, coproprietaire: 1, locataire: 2, professionnel: 3, autre: 4 };

type RowCopro = { referenceCrypto: string | null };
type RowContact = { email: string; nom: string | null; qualite: string; metier: string | null };

const cache = new Map<string, { valeur: ContactCopro[]; expire: number }>();

export class SupabaseContactsCopro implements ContactsCoproProvider {
  async listerParCopro(reference: string): Promise<ContactCopro[]> {
    const ref = reference.trim();
    const enCache = cache.get(ref);
    if (enCache && Date.now() < enCache.expire) return enCache.valeur;

    const sb = createSupabasePublicClient();
    const { data: copro } = await sb
      .from("Copropriete")
      .select("referenceCrypto")
      .or(`referenceEstale.eq.${ref},referenceCrypto.eq.${ref}`)
      .limit(1)
      .maybeSingle<RowCopro>();
    const code = copro?.referenceCrypto?.trim();

    let contacts: ContactCopro[] = [];
    if (code) {
      const { data } = await sb
        .from("intranet_crypto_annuaire")
        .select("email, nom, qualite, metier")
        .eq("copro_code", code)
        .order("email")
        .returns<RowContact[]>();
      // Dédoublonnage par email (une adresse peut avoir plusieurs lignes), on garde le nom le plus informatif.
      const parEmail = new Map<string, ContactCopro>();
      for (const r of data ?? []) {
        const email = r.email.trim().toLowerCase();
        if (!email) continue;
        const deja = parEmail.get(email);
        const c: ContactCopro = { email, nom: (r.nom ?? "").trim(), qualite: r.qualite, ...(r.metier ? { metier: r.metier } : {}) };
        if (!deja || (!deja.nom && c.nom)) parEmail.set(email, deja ? { ...deja, nom: c.nom || deja.nom } : c);
      }
      contacts = [...parEmail.values()].sort(
        (a, b) => (ORDRE_QUALITE[a.qualite] ?? 9) - (ORDRE_QUALITE[b.qualite] ?? 9) || a.nom.localeCompare(b.nom, "fr"),
      );
    }
    cache.set(ref, { valeur: contacts, expire: Date.now() + TTL_MS });
    return contacts;
  }
}
