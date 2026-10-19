// Referentiel du tri pour les copros Crypto (decision du 12/10/2026 : syndic4 couvre toute
// l'agence de Houilles, dont 33 copros sur 35 ne sont pas dans ESTALE). LECTURE SEULE.
//   - les copros actives de l'agence et leur equipe : table Copropriete + User ;
//   - les adresses connues : intranet_crypto_annuaire, synchronise chaque nuit depuis
//     l'export Crypto (scripts/sync-annuaire-crypto.mjs, REA-291) ;
//   - les noms d'usage et autres adresses au registre national : intranet_registre_copros
//     (scripts/importer-registre-copros.mjs), joint par l'immatriculation.
// Agence : MAIL_TRI_AGENCE (nom court de la table Agency, ex. « HLS ») ; absente = tout le
// parc. Cache module de 10 min, comme le referentiel ESTALE.

import type { CoproTri, LienExpediteur, MembreTri, QualiteExpediteur, ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";
import { signalerException } from "@/lib/observabilite";
import { createSupabasePublicClient } from "./public-client";

const TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

type RowCopro = {
  referenceCrypto: string | null;
  referenceEstale: string | null;
  name: string;
  address1: string | null;
  postalCode: string | null;
  city: string | null;
  registrationNumber: string | null;
  managerId: string | null;
  assistantId: string | null;
};
type RowUser = { id: string; name: string; email: string | null };
type RowAnnuaire = { email: string; qualite: string; copro_code: string };
type RowRegistre = {
  immatriculation: string;
  nom_usage: string | null;
  adresse: string | null;
  adresses_compl: string[] | null;
  code_postal: string | null;
  commune: string | null;
};

const normaliserAdresse = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Ce que le registre national ajoute a une copro : ses noms d'usage et ses autres adresses
 * (adresse de reference, adresses complementaires). Les adresses complementaires du registre
 * portent deja code postal et ville (« 2 Avenue de Colmar 92500 Rueil-Malmaison ») ; a defaut,
 * on leur ajoute ceux de l'adresse de reference. Une adresse deja connue n'est pas repetee.
 */
export function apportDuRegistre(
  r: RowRegistre,
  copro: { nom: string; adresse: string },
): { nomsUsage?: string[]; adressesSecondaires?: string[] } {
  const lieu = [r.code_postal, r.commune].map((x) => x?.trim()).filter(Boolean).join(" ");
  const complete = (a: string) => (/\b\d{5}\b/.test(a) || !lieu ? a : `${a} ${lieu}`);
  const connues = new Set([normaliserAdresse(copro.adresse)]);
  const adresses: string[] = [];
  for (const brute of [r.adresse, ...(r.adresses_compl ?? [])]) {
    const a = brute?.trim();
    if (!a) continue;
    const ligne = complete(a);
    const cle = normaliserAdresse(ligne);
    if (connues.has(cle)) continue;
    connues.add(cle);
    adresses.push(ligne);
  }
  const nom = r.nom_usage?.trim();
  const nouveauNom = nom && normaliserAdresse(nom) !== normaliserAdresse(copro.nom) ? nom : null;
  return {
    ...(nouveauNom ? { nomsUsage: [nouveauNom] } : {}),
    ...(adresses.length ? { adressesSecondaires: adresses } : {}),
  };
}

const QUALITE: Record<string, QualiteExpediteur | undefined> = {
  coproprietaire: "copropriétaire",
  conseil_syndical: "conseil syndical",
  locataire: "locataire",
};

let cache: { cle: string; valeur: ReferentielTri; expire: number } | null = null;

export class SupabaseReferentielTriCrypto implements ReferentielTriProvider {
  constructor(private readonly agence: string | null) {}

  async charger(): Promise<ReferentielTri> {
    const cleCache = this.agence ?? "*";
    if (cache && cache.cle === cleCache && Date.now() < cache.expire) return cache.valeur;
    const valeur = await this.lire();
    cache = { cle: cleCache, valeur, expire: Date.now() + TTL_MS };
    return valeur;
  }

  private async lire(): Promise<ReferentielTri> {
    const sb = createSupabasePublicClient();

    let agencyId: string | null = null;
    if (this.agence) {
      const { data, error } = await sb.from("Agency").select("id").eq("name", this.agence).maybeSingle<{ id: string }>();
      if (error || !data) throw new Error(`Agence « ${this.agence} » introuvable (MAIL_TRI_AGENCE).`);
      agencyId = data.id;
    }

    let q = sb
      .from("Copropriete")
      .select("referenceCrypto, referenceEstale, name, address1, postalCode, city, registrationNumber, managerId, assistantId")
      .eq("status", "ACTIVE");
    if (agencyId) q = q.eq("agencyId", agencyId);
    const { data: lignes, error } = await q.returns<RowCopro[]>();
    if (error) throw new Error(`Lecture Copropriete : ${error.message}`);

    const ids = [...new Set((lignes ?? []).flatMap((c) => [c.managerId, c.assistantId]).filter((x): x is string => Boolean(x)))];
    const membres = new Map<string, MembreTri>();
    if (ids.length) {
      const { data: users } = await sb.from("User").select("id, name, email").in("id", ids).returns<RowUser[]>();
      for (const u of users ?? []) if (u.email) membres.set(u.id, { nomComplet: u.name, email: u.email.toLowerCase() });
    }

    // La reference affichee : celle d'ESTALE si la copro y est deja, sinon celle de Crypto.
    const copros: CoproTri[] = [];
    const referenceDuCodeCrypto = new Map<string, string>();
    for (const c of lignes ?? []) {
      const reference = (c.referenceEstale ?? c.referenceCrypto ?? "").trim();
      if (!reference) continue;
      if (c.referenceCrypto) referenceDuCodeCrypto.set(c.referenceCrypto.trim(), reference);
      copros.push({
        reference,
        nom: c.name,
        adresse: [c.address1, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" "),
        gestionnaire: (c.managerId && membres.get(c.managerId)) || null,
        assistant: (c.assistantId && membres.get(c.assistantId)) || null,
        source: "crypto",
        ...(c.registrationNumber ? { immatriculation: c.registrationNumber.trim() } : {}),
      });
    }

    const avertissements: string[] = [];
    await this.completerParLeRegistre(sb, copros);

    const expediteurs: Record<string, LienExpediteur[]> = {};
    const codes = [...referenceDuCodeCrypto.keys()];
    try {
      for (let debut = 0; codes.length; debut += PAGE) {
        let qa = sb.from("intranet_crypto_annuaire").select("email, qualite, copro_code").not("copro_code", "is", null);
        if (agencyId) qa = qa.in("copro_code", codes);
        const { data, error: e } = await qa.order("email").range(debut, debut + PAGE - 1).returns<RowAnnuaire[]>();
        if (e) throw new Error(e.message);
        for (const a of data ?? []) {
          const qualite = QUALITE[a.qualite];
          const reference = referenceDuCodeCrypto.get(a.copro_code);
          if (!qualite || !reference) continue;
          const liste = (expediteurs[a.email] ??= []);
          if (!liste.some((l) => l.reference === reference && l.qualite === qualite)) liste.push({ reference, qualite, source: "crypto" });
        }
        if ((data ?? []).length < PAGE) break;
      }
    } catch (e) {
      // Annuaire absent ou illisible : les copros restent proposees par leur code.
      avertissements.push("L'annuaire des expéditeurs Crypto est indisponible : seuls les codes cités servent pour les copros Crypto.");
      console.error("[tri-emails] annuaire Crypto :", e instanceof Error ? e.message : e);
    }

    return { copros, expediteurs, avertissements };
  }

  /**
   * Noms d'usage et autres adresses du registre national, en UNE requete sur les
   * immatriculations connues. Table absente ou illisible : le tri continue sans (le nom Crypto
   * et l'adresse de la fiche suffisent), l'incident part a Sentry.
   */
  private async completerParLeRegistre(sb: ReturnType<typeof createSupabasePublicClient>, copros: CoproTri[]): Promise<void> {
    const immats = [...new Set(copros.map((c) => c.immatriculation).filter((x): x is string => Boolean(x)))];
    if (!immats.length) return;
    try {
      const { data, error } = await sb
        .from("intranet_registre_copros")
        .select("immatriculation, nom_usage, adresse, adresses_compl, code_postal, commune")
        .in("immatriculation", immats)
        .returns<RowRegistre[]>();
      if (error) throw new Error(error.message);
      const parImmat = new Map((data ?? []).map((r) => [r.immatriculation.trim().toUpperCase(), r]));
      for (const c of copros) {
        const r = c.immatriculation ? parImmat.get(c.immatriculation.toUpperCase()) : undefined;
        if (r) Object.assign(c, apportDuRegistre(r, c));
      }
    } catch (e) {
      signalerException(e, { source: "tri-emails", detail: { etape: "registre national", immatriculations: immats.length } });
      console.error("[tri-emails] registre national :", e instanceof Error ? e.message : e);
    }
  }
}
