// Adapter Supabase du referentiel copro : lit public."Copropriete" (modele Prisma
// de l'App A) et mappe vers le domaine. Lecture seule (ADR-002). Seul cet adapter
// connait la forme Prisma ; le domaine et l'UI l'ignorent (ADR-001).

import type { CoproRepository } from "@/lib/ports/copro-repository";
import type {
  Adresse,
  Copropriete,
  Exercice,
  MembreEquipe,
  SourceCopro,
  StatutCopro,
} from "@/lib/domain/copropriete";
import { createSupabasePublicClient } from "./public-client";

// Sous-ensemble des 62 colonnes de public."Copropriete" reellement utilise par la fiche.
type CoproRow = {
  id: string;
  referenceCrypto: string | null;
  referenceEstale: string | null;
  externalIdEstale: string | null;
  dataSource: string | null;
  name: string;
  address1: string | null;
  address2: string | null;
  postalCode: string | null;
  city: string | null;
  status: string | null;
  managerId: string | null;
  assistantId: string | null;
  accountantId: string | null;
  mainLotsCount: number | null;
  otherLotsCount: number | null;
  accountingStartDate: string | null;
  accountingEndDate: string | null;
  syndicInitialDate: string | null;
  lastAGDate: string | null;
  nextAGDate: string | null;
  lastCSDate: string | null;
  nextCSDate: string | null;
  ppt: boolean | null;
};

type UserRow = { id: string; name: string; initials: string | null };

const COPRO_COLS =
  "id, referenceCrypto, referenceEstale, externalIdEstale, dataSource, name, " +
  "address1, address2, postalCode, city, status, managerId, assistantId, accountantId, " +
  "mainLotsCount, otherLotsCount, accountingStartDate, accountingEndDate, " +
  "syndicInitialDate, lastAGDate, nextAGDate, lastCSDate, nextCSDate, ppt";

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function mapSource(dataSource: string | null): SourceCopro {
  return (dataSource ?? "").toLowerCase().includes("estale") ? "estale" : "crypto";
}

function mapStatut(status: string | null): StatutCopro {
  return (status ?? "").toLowerCase().startsWith("activ") ? "active" : "inactive";
}

function codeDe(row: CoproRow): string {
  return row.referenceCrypto ?? row.referenceEstale ?? row.id;
}

function adresseDe(row: CoproRow): Adresse {
  return {
    ligne1: row.address1 ?? "",
    ...(row.address2 ? { ligne2: row.address2 } : {}),
    codePostal: row.postalCode ?? "",
    ville: row.city ?? "",
  };
}

// Les dates sont lues DEPUIS LA CHAINE "YYYY-MM-DD..." (et non via `new Date`),
// pour eviter tout decalage de fuseau sur un timestamp a minuit (01/01 -> 31/12).

/** "01/01" depuis un timestamp ISO ; "-" si absent. */
function jourMois(iso: string | null): string {
  if (!iso) return "-";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

function exerciceDe(row: CoproRow): Exercice {
  return { debut: jourMois(row.accountingStartDate), fin: jourMois(row.accountingEndDate) };
}

/** "mars 2018" depuis un timestamp ISO ; "-" si absent. */
function moisAnnee(iso: string | null): string {
  if (!iso) return "-";
  const [y, m] = iso.slice(0, 10).split("-");
  return `${MOIS[Number(m) - 1]} ${y}`;
}

/** Date ISO "YYYY-MM-DD" depuis un timestamp ; null si absent. */
function dateISO(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}

function toDomaine(row: CoproRow, equipe: MembreEquipe[]): Copropriete {
  const source = mapSource(row.dataSource);
  const derniereDate = dateISO(row.lastAGDate);
  const prochaineDate = dateISO(row.nextAGDate);
  const derniereCs = dateISO(row.lastCSDate);
  const prochaineCs = dateISO(row.nextCSDate);
  const deepBase = process.env.ESTALE_DEEPLINK_BASE;
  return {
    code: codeDe(row),
    source,
    nom: row.name,
    adresse: adresseDe(row),
    statut: mapStatut(row.status),
    lotsPrincipaux: row.mainLotsCount ?? 0,
    lotsAutres: row.otherLotsCount ?? 0,
    exercice: exerciceDe(row),
    priseEnGestion: moisAnnee(row.syndicInitialDate),
    equipe,
    ...(derniereDate ? { derniereAgDate: derniereDate } : {}),
    ...(prochaineDate
      ? {
          prochaineAg: {
            date: prochaineDate,
            statut: "planifiee" as const,
            supervisionId: `${codeDe(row)}__${prochaineDate}`,
          },
        }
      : {}),
    ...(derniereCs ? { derniereCsDate: derniereCs } : {}),
    ...(prochaineCs ? { prochaineCsDate: prochaineCs } : {}),
    ...(row.ppt !== null ? { pptVote: row.ppt } : {}),
    ...(source === "estale" && deepBase && (row.externalIdEstale ?? row.referenceEstale)
      ? { estaleDeepLink: `${deepBase}/condo/${row.externalIdEstale ?? row.referenceEstale}` }
      : {}),
  };
}

export class SupabaseCoproRepository implements CoproRepository {
  async list(managerId?: string): Promise<Copropriete[]> {
    const supabase = createSupabasePublicClient();
    let q = supabase
      .from("Copropriete")
      .select(COPRO_COLS)
      .order("name", { ascending: true })
      .limit(500);
    if (managerId) q = q.eq("managerId", managerId); // cloisonnement gestionnaire
    const { data, error } = await q;
    if (error) throw new Error(`Lecture public.Copropriete : ${error.message}`);
    // Pas de resolution d'equipe en liste (la vue liste ne l'affiche pas).
    return (data as unknown as CoproRow[]).map((row) => toDomaine(row, []));
  }

  async findByCode(code: string, managerId?: string): Promise<Copropriete | null> {
    const supabase = createSupabasePublicClient();

    // Le code affiche correspond a referenceCrypto, ou referenceEstale pour une copro eStale.
    // Le filtre managerId cloisonne : une copro hors scope renvoie null (-> notFound).
    const requete = (colonne: "referenceCrypto" | "referenceEstale") => {
      let q = supabase.from("Copropriete").select(COPRO_COLS).eq(colonne, code);
      if (managerId) q = q.eq("managerId", managerId);
      return q.maybeSingle();
    };
    let { data } = await requete("referenceCrypto");
    if (!data) ({ data } = await requete("referenceEstale"));
    if (!data) return null;

    const row = data as unknown as CoproRow;
    const equipe = await this.resoudreEquipe(supabase, row);
    return toDomaine(row, equipe);
  }

  /** Resout l'equipe a partir des FK manager/assistant/accountant vers public."User".
   *  Le role vient du champ d'origine (et non de User.role, dont l'enum n'est pas mappe). */
  private async resoudreEquipe(
    supabase: ReturnType<typeof createSupabasePublicClient>,
    row: CoproRow,
  ): Promise<MembreEquipe[]> {
    const refs: { id: string; role: MembreEquipe["role"] }[] = [
      ...(row.managerId ? [{ id: row.managerId, role: "gestionnaire" as const }] : []),
      ...(row.assistantId ? [{ id: row.assistantId, role: "assistant" as const }] : []),
      ...(row.accountantId ? [{ id: row.accountantId, role: "comptable" as const }] : []),
    ];
    if (refs.length === 0) return [];

    const { data } = await supabase
      .from("User")
      .select("id, name, initials")
      .in("id", refs.map((r) => r.id));
    const users = new Map((data as unknown as UserRow[] | null)?.map((u) => [u.id, u]) ?? []);

    return refs.flatMap((ref) => {
      const u = users.get(ref.id);
      if (!u) return [];
      return [{
        initiales: u.initials ?? u.name.slice(0, 2).toUpperCase(),
        nomComplet: u.name,
        role: ref.role,
      }];
    });
  }
}
