// Contacts d'une copro depuis l'annuaire Crypto (intranet_crypto_annuaire), pour le
// compositeur. LECTURE SEULE (service_role : RLS activée sans policy). L'annuaire est keyé
// par le code CRYPTO (copro_code = referenceCrypto) ; on résout d'abord ce code depuis la
// référence affichée (ESTALE ou Crypto) via la table Copropriete. Cache module 10 min.

import type { ContactCopro, IdentiteAnnuaire } from "@/lib/domain/mes-emails-composition";
import type { ContactsCoproProvider } from "@/lib/ports/contacts-copro-provider";
import { createSupabasePublicClient } from "./public-client";

const TTL_MS = 10 * 60 * 1000;
const ORDRE_QUALITE: Record<string, number> = { conseil_syndical: 0, coproprietaire: 1, locataire: 2, professionnel: 3, autre: 4 };

type RowCopro = { referenceCrypto: string | null };
type RowContact = { email: string; nom: string | null; qualite: string; metier: string | null };
type RowIdentite = { email: string; tiers_id: string; nom: string | null; qualite: string; metier: string | null; copro_code: string | null; source: string };
// Large : le service garde ensuite les personnes de l'agence, puis les 15 premières.
const MAX_IDENTITES = 60;

const cache = new Map<string, { valeur: ContactCopro[]; expire: number }>();

export class SupabaseContactsCopro implements ContactsCoproProvider {
  rechercherIdentites(texte: string): Promise<IdentiteAnnuaire[]> {
    return rechercherIdentitesAnnuaire(texte);
  }

  async listerParCopro(reference: string): Promise<ContactCopro[]> {
    const ref = reference.trim().toUpperCase();
    // Défense en profondeur : la référence est interpolée dans un filtre .or() PostgREST.
    if (!/^(SE|S)\d{3,4}$/.test(ref)) return [];
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

/**
 * Recherche par nom ou adresse dans l'annuaire Crypto, regroupée par PERSONNE (fiche Tiers) :
 * toutes ses adresses et toutes ses copros. Un correspondant (source « correspondant ») reste
 * une entrée à part : ce n'est pas la même personne que la fiche.
 */
async function rechercherIdentitesAnnuaire(texte: string): Promise<IdentiteAnnuaire[]> {
  // Défense en profondeur : le texte finit dans un filtre .or() PostgREST (virgules,
  // parenthèses et étoiles retirées).
  const q = texte.normalize("NFC").replace(/[^\p{L}\p{N}@.\-' ]+/gu, " ").replace(/\s+/g, " ").trim();
  if (q.length < 3) return [];
  const sb = createSupabasePublicClient();
  // Chaque mot doit se trouver dans le nom ou l'adresse, dans n'importe quel ordre :
  // Crypto écrit « MARTIN Jean », on tape « jean martin ».
  let requete = sb.from("intranet_crypto_annuaire").select("tiers_id");
  for (const mot of q.split(" ")) requete = requete.or(`nom.ilike.*${mot}*,email.ilike.*${mot}*`);
  const { data: trouves } = await requete.limit(300).returns<{ tiers_id: string }[]>();
  const tiers = [...new Set((trouves ?? []).map((r) => r.tiers_id))].slice(0, MAX_IDENTITES);
  if (tiers.length === 0) return [];

  const { data: lignes } = await sb
    .from("intranet_crypto_annuaire")
    .select("email, tiers_id, nom, qualite, metier, copro_code, source")
    .in("tiers_id", tiers)
    .returns<RowIdentite[]>();

  const codes = [...new Set((lignes ?? []).map((l) => l.copro_code).filter((c): c is string => Boolean(c)))];
  const refDe = new Map<string, string>();
  if (codes.length) {
    const { data: copros } = await sb
      .from("Copropriete")
      .select("referenceCrypto, referenceEstale")
      .in("referenceCrypto", codes)
      .returns<{ referenceCrypto: string; referenceEstale: string | null }[]>();
    for (const c of copros ?? []) refDe.set(c.referenceCrypto, (c.referenceEstale || c.referenceCrypto).trim());
  }

  const parCle = new Map<string, IdentiteAnnuaire>();
  for (const l of lignes ?? []) {
    const email = l.email.trim().toLowerCase();
    const cle = l.source === "fiche" ? l.tiers_id : `${l.tiers_id}|${email}`;
    const id = parCle.get(cle) ?? { cle, nom: "", emails: [], copros: [] };
    if (!id.nom && l.nom) id.nom = l.nom.trim();
    if (!id.metier && l.metier) id.metier = l.metier.trim();
    if (email && !id.emails.includes(email)) id.emails.push(email);
    if (l.copro_code) {
      const reference = refDe.get(l.copro_code) ?? l.copro_code;
      const deja = id.copros.find((c) => c.reference === reference);
      if (!deja) id.copros.push({ reference, qualite: l.qualite });
      else if (l.qualite === "conseil_syndical") deja.qualite = l.qualite;
    }
    parCle.set(cle, id);
  }
  // Les fiches d'abord (la personne elle-même), puis ses correspondants.
  return [...parCle.values()].sort((a, b) => Number(a.cle.includes("|")) - Number(b.cle.includes("|")) || a.nom.localeCompare(b.nom, "fr"));
}
