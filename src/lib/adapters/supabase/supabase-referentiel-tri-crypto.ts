// Referentiel du tri pour les copros Crypto (decision du 12/10/2026 : syndic4 couvre toute
// l'agence de Houilles, dont 33 copros sur 35 ne sont pas dans ESTALE). LECTURE SEULE.
//   - les copros de l'agence (actives, et inactives marquees comme telles) et leur equipe :
//     table Copropriete + User ;
//   - les adresses connues : intranet_crypto_annuaire, synchronise chaque nuit depuis
//     l'export Crypto (scripts/sync-annuaire-crypto.mjs, REA-291) ;
//   - les noms d'usage et autres adresses au registre national : intranet_registre_copros
//     (scripts/importer-registre-copros.mjs), joint par l'immatriculation.
// Agences : celles de la boite triee (nom court de la table Agency, ex. « HLS », ou
// « LGC » et « ASN » pour syndic2 ; V2 du 27/10/2026). Aucune agence = aucune copro, jamais
// tout le parc. Cache module de 10 min par liste d'agences, comme le referentiel ESTALE.

import type { CoproTri, LienExpediteur, MembreTri, QualiteExpediteur, ReferentielTri } from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";
import { signalerException } from "@/lib/observabilite";
import { createSupabasePublicClient } from "./public-client";

const TTL_MS = 10 * 60 * 1000;
const PAGE = 1000;

type RowCopro = {
  agencyId: string | null;
  referenceCrypto: string | null;
  referenceEstale: string | null;
  name: string;
  address1: string | null;
  postalCode: string | null;
  city: string | null;
  registrationNumber: string | null;
  managerId: string | null;
  assistantId: string | null;
  status: string;
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

/** Cache par liste d'agences (cle : codes tries, joints) : deux boites ne se marchent pas dessus. */
const cache = new Map<string, { valeur: ReferentielTri; expire: number }>();

export class SupabaseReferentielTriCrypto implements ReferentielTriProvider {
  private readonly agences: string[];

  constructor(agences: readonly string[]) {
    this.agences = [...new Set(agences.map((a) => a.trim().toUpperCase()).filter(Boolean))].sort();
  }

  async charger(): Promise<ReferentielTri> {
    if (this.agences.length === 0) return { copros: [], expediteurs: {} };
    const cleCache = this.agences.join(",");
    const deja = cache.get(cleCache);
    if (deja && Date.now() < deja.expire) return deja.valeur;
    const valeur = await this.lire();
    cache.set(cleCache, { valeur, expire: Date.now() + TTL_MS });
    return valeur;
  }

  private async lire(): Promise<ReferentielTri> {
    const sb = createSupabasePublicClient();

    const { data: agences, error: errAgences } = await sb.from("Agency").select("id, name").in("name", this.agences).returns<{ id: string; name: string }[]>();
    if (errAgences) throw new Error(`Lecture Agency : ${errAgences.message}`);
    const codeParId = new Map((agences ?? []).map((a) => [a.id, a.name.trim().toUpperCase()]));
    const absentes = this.agences.filter((a) => ![...codeParId.values()].includes(a));
    if (absentes.length) throw new Error(`Agence(s) ${absentes.join(", ")} introuvable(s) dans la table Agency (config MAIL_TRI_BOITES).`);

    // Les copros INACTIVES sont lues aussi (S182 : on recoit encore des mails de l'ancien
    // syndic, de coproprietaires, de locataires) ; le tri les plafonne a une piste faible.
    const { data: lues, error } = await sb
      .from("Copropriete")
      .select("agencyId, referenceCrypto, referenceEstale, name, address1, postalCode, city, registrationNumber, managerId, assistantId, status")
      .in("status", ["ACTIVE", "INACTIVE"])
      .in("agencyId", [...codeParId.keys()])
      .returns<RowCopro[]>();
    if (error) throw new Error(`Lecture Copropriete : ${error.message}`);
    // Les actives d'abord : une fiche inactive qui porte le meme code qu'une active s'efface.
    const lignes = [...(lues ?? [])].sort((a, b) => Number(a.status !== "ACTIVE") - Number(b.status !== "ACTIVE"));

    const ids = [...new Set(lignes.flatMap((c) => [c.managerId, c.assistantId]).filter((x): x is string => Boolean(x)))];
    const membres = new Map<string, MembreTri>();
    if (ids.length) {
      const { data: users } = await sb.from("User").select("id, name, email").in("id", ids).returns<RowUser[]>();
      for (const u of users ?? []) if (u.email) membres.set(u.id, { nomComplet: u.name, email: u.email.toLowerCase() });
    }

    // La reference affichee : celle d'ESTALE si la copro y est deja, sinon celle de Crypto.
    const copros: CoproTri[] = [];
    const referenceDuCodeCrypto = new Map<string, string>();
    const vues = new Set<string>();
    for (const c of lignes) {
      const reference = (c.referenceEstale ?? c.referenceCrypto ?? "").trim();
      if (!reference || vues.has(reference)) continue;
      vues.add(reference);
      if (c.referenceCrypto && !referenceDuCodeCrypto.has(c.referenceCrypto.trim())) referenceDuCodeCrypto.set(c.referenceCrypto.trim(), reference);
      copros.push({
        reference,
        nom: c.name,
        adresse: [c.address1, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(" "),
        gestionnaire: (c.managerId && membres.get(c.managerId)) || null,
        assistant: (c.assistantId && membres.get(c.assistantId)) || null,
        source: "crypto",
        ...(c.registrationNumber ? { immatriculation: c.registrationNumber.trim() } : {}),
        ...(c.status === "INACTIVE" ? { inactive: true } : {}),
        ...(c.agencyId && codeParId.get(c.agencyId) ? { agence: codeParId.get(c.agencyId)! } : {}),
      });
    }

    const avertissements: string[] = [];
    await this.completerParLeRegistre(sb, copros);

    const expediteurs: Record<string, LienExpediteur[]> = {};
    const codes = [...referenceDuCodeCrypto.keys()];
    try {
      for (let debut = 0; codes.length; debut += PAGE) {
        const qa = sb.from("intranet_crypto_annuaire").select("email, qualite, copro_code").not("copro_code", "is", null).in("copro_code", codes);
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
