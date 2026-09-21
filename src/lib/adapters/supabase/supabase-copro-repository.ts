// Adapter Supabase du referentiel copro : lit public."Copropriete" (modele Prisma
// de l'App A) et mappe vers le domaine. Lecture seule (ADR-002). Seul cet adapter
// connait la forme Prisma ; le domaine et l'UI l'ignorent (ADR-001).

import type { CoproPerdueInput, CoproRepository } from "@/lib/ports/copro-repository";
import type { NouvelleCopro } from "@/lib/domain/proposition/election";
import type {
  Adresse,
  Copropriete,
  Exercice,
  MembreEquipe,
  SourceCopro,
  StatutCopro,
  FormeJuridique,
} from "@/lib/domain/copropriete";
import { heureDe } from "@/lib/domain/reunion";
import { createSupabasePublicClient } from "./public-client";
import { filtrePerimetre } from "./perimetre";
import { toutesLesLignes } from "./pages";
import { exigerUneLigne, filtreCodeCopro, idCoproUnique } from "./cible-copro";

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
  legalForm: string | null;
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
  // Champs referentiel exploitables sans Estale.
  insuranceDueDate: string | null;
  syndicContractEndDate: string | null;
  lastGasVmcCtqDate: string | null;
  registrationNumber: string | null;
  sdcName: string | null;
  agConnect: boolean | null;
  sharepointUrl: string | null;
  agencyId: string | null;
};

type UserRow = { id: string; name: string; initials: string | null };

const COPRO_COLS =
  "id, referenceCrypto, referenceEstale, externalIdEstale, dataSource, name, " +
  "address1, address2, postalCode, city, status, legalForm, managerId, assistantId, accountantId, " +
  "mainLotsCount, otherLotsCount, accountingStartDate, accountingEndDate, " +
  "syndicInitialDate, lastAGDate, nextAGDate, lastCSDate, nextCSDate, ppt, " +
  "insuranceDueDate, syndicContractEndDate, lastGasVmcCtqDate, registrationNumber, " +
  "sdcName, agConnect, sharepointUrl, agencyId";

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function mapSource(dataSource: string | null): SourceCopro {
  return (dataSource ?? "").toLowerCase().includes("estale") ? "estale" : "crypto";
}

/** App A : COPROPRIETE / ASL / AFUL ; tout le reste (null, valeur inconnue) = copropriete. */
function mapFormeJuridique(legalForm: string | null): FormeJuridique {
  const v = (legalForm ?? "").trim().toUpperCase();
  return v === "ASL" ? "asl" : v === "AFUL" ? "aful" : "copropriete";
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
  // Heure de reunion extraite du timestamp (T00:00 des donnees existantes -> pas d'heure).
  const prochaineHeure = heureDe(row.nextAGDate);
  const prochaineCsHeure = heureDe(row.nextCSDate);
  const deepBase = process.env.ESTALE_DEEPLINK_BASE;
  return {
    code: codeDe(row),
    source,
    nom: row.name,
    adresse: adresseDe(row),
    statut: mapStatut(row.status),
    ...(mapFormeJuridique(row.legalForm) !== "copropriete" ? { formeJuridique: mapFormeJuridique(row.legalForm) } : {}),
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
            ...(prochaineHeure ? { heure: prochaineHeure } : {}),
            statut: "planifiee" as const,
            supervisionId: `${codeDe(row)}__${prochaineDate}`,
          },
        }
      : {}),
    ...(derniereCs ? { derniereCsDate: derniereCs } : {}),
    ...(prochaineCs ? { prochaineCsDate: prochaineCs } : {}),
    ...(prochaineCs && prochaineCsHeure ? { prochaineCsHeure } : {}),
    ...(row.ppt !== null ? { pptVote: row.ppt } : {}),
    ...(source === "estale" && deepBase && (row.externalIdEstale ?? row.referenceEstale)
      ? { estaleDeepLink: `${deepBase}/condo/${row.externalIdEstale ?? row.referenceEstale}` }
      : {}),
    // Champs referentiel (exploitables sans Estale).
    ...(dateISO(row.insuranceDueDate) ? { assuranceEcheance: dateISO(row.insuranceDueDate)! } : {}),
    ...(dateISO(row.syndicContractEndDate) ? { mandatSyndicFin: dateISO(row.syndicContractEndDate)! } : {}),
    ...(dateISO(row.lastGasVmcCtqDate) ? { ctqGazVmcDate: dateISO(row.lastGasVmcCtqDate)! } : {}),
    ...(row.registrationNumber ? { immatriculation: row.registrationNumber } : {}),
    ...(row.sdcName ? { nomSdc: row.sdcName } : {}),
    ...(row.agConnect !== null ? { agConnect: row.agConnect } : {}),
    ...(row.sharepointUrl ? { sharepointUrl: row.sharepointUrl } : {}),
    ...(row.agencyId ? { agenceId: row.agencyId } : {}),
  };
}

export class SupabaseCoproRepository implements CoproRepository {
  async list(managerId?: string): Promise<Copropriete[]> {
    const supabase = createSupabasePublicClient();
    // Par pages : la liste ne se tronque plus en silence au-dela d'un plafond (audit 16/09/2026).
    const rows = await toutesLesLignes<CoproRow>("Lecture public.Copropriete", (debut, fin) => {
      let q = supabase.from("Copropriete").select(COPRO_COLS).order("name", { ascending: true }).order("id").range(debut, fin);
      if (managerId) q = q.or(filtrePerimetre(managerId)); // cloisonnement : gere OU assiste
      return q;
    });
    // Pas de resolution d'equipe en liste (la vue liste ne l'affiche pas).
    // On n'affiche que les copros ACTIVES (les inactives sont masquees des listes).
    return rows
      .map((row) => toDomaine(row, []))
      .filter((c) => c.statut === "active");
  }

  // Vue transverse (dashboard comptable) : toutes les copros ACTIVES avec l'equipe
  // resolue. La resolution se fait en UNE requete User batch (tous les managers/assistants/
  // comptables d'un coup) -> pas de N+1, contrairement a un findByCode par copro.
  async listerToutes(): Promise<Copropriete[]> {
    const supabase = createSupabasePublicClient();
    const rows = await toutesLesLignes<CoproRow>("Lecture public.Copropriete", (debut, fin) =>
      supabase.from("Copropriete").select(COPRO_COLS).order("name", { ascending: true }).order("id").range(debut, fin),
    );

    // Un seul aller-retour pour tous les membres d'equipe referencies.
    const ids = new Set<string>();
    for (const r of rows) {
      if (r.managerId) ids.add(r.managerId);
      if (r.assistantId) ids.add(r.assistantId);
      if (r.accountantId) ids.add(r.accountantId);
    }
    const users = new Map<string, UserRow>();
    if (ids.size > 0) {
      const { data: u } = await supabase.from("User").select("id, name, initials").in("id", [...ids]);
      for (const usr of (u as unknown as UserRow[] | null) ?? []) users.set(usr.id, usr);
    }

    const equipeDe = (row: CoproRow): MembreEquipe[] => {
      const refs: { id: string | null; role: MembreEquipe["role"] }[] = [
        { id: row.managerId, role: "gestionnaire" },
        { id: row.assistantId, role: "assistant" },
        { id: row.accountantId, role: "comptable" },
      ];
      return refs.flatMap((ref) => {
        if (!ref.id) return [];
        const usr = users.get(ref.id);
        if (!usr) return [];
        return [{ initiales: usr.initials ?? usr.name.slice(0, 2).toUpperCase(), nomComplet: usr.name, role: ref.role }];
      });
    };

    return rows.map((row) => toDomaine(row, equipeDe(row))).filter((c) => c.statut === "active");
  }

  async findByCode(code: string, managerId?: string): Promise<Copropriete | null> {
    const supabase = createSupabasePublicClient();

    // Le code affiche correspond a referenceCrypto, ou referenceEstale pour une copro Estale.
    // Le filtre managerId cloisonne : une copro hors scope renvoie null (-> notFound).
    const requete = (colonne: "referenceCrypto" | "referenceEstale") => {
      let q = supabase.from("Copropriete").select(COPRO_COLS).eq(colonne, code);
      if (managerId) q = q.or(filtrePerimetre(managerId)); // cloisonnement : gere OU assiste
      return q.maybeSingle();
    };
    let { data } = await requete("referenceCrypto");
    if (!data) ({ data } = await requete("referenceEstale"));
    if (!data) return null;

    const row = data as unknown as CoproRow;
    const equipe = await this.resoudreEquipe(supabase, row);
    return toDomaine(row, equipe);
  }

  async setDateEvenement(
    coproCode: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
    managerId: string,
  ): Promise<void> {
    const supabase = createSupabasePublicClient();
    const colonnes = {
      ag: { prochaine: "nextAGDate", derniere: "lastAGDate" },
      cs: { prochaine: "nextCSDate", derniere: "lastCSDate" },
    } as const;
    const colonne = colonnes[type][quand];
    // Ecriture dans la source partagee (App A). Scope managerId : seulement ses copros.
    // updatedAt rafraichi pour rester coherent avec l'App A (qui s'appuie dessus).
    // On resout d'abord LA fiche (code + perimetre), puis on ecrit par id : hors perimetre
    // ou code inconnu, c'est une erreur dite, plus un UPDATE silencieux de zero ligne.
    const contexte = `MAJ date ${type}`;
    const id = await idCoproUnique(supabase, coproCode, contexte, filtrePerimetre(managerId));
    const { data, error } = await supabase
      .from("Copropriete")
      .update({ [colonne]: dateISO, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    exigerUneLigne(contexte, data, error);
  }

  async setFormeJuridique(coproCode: string, forme: FormeJuridique): Promise<void> {
    const supabase = createSupabasePublicClient();
    const contexte = "Forme juridique";
    const id = await idCoproUnique(supabase, coproCode, contexte);
    const { data, error } = await supabase
      .from("Copropriete")
      .update({ legalForm: forme.toUpperCase(), updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    exigerUneLigne(contexte, data, error);
  }

  async creerCopro(c: NouvelleCopro): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { data: existante, error: erreurLecture } = await supabase
      .from("Copropriete")
      .select("id")
      .or(filtreCodeCopro(c.code))
      .limit(1);
    // Lecture en panne : on ne cree pas a l'aveugle (un doublon de code casserait tout le filtrage).
    if (erreurLecture) throw new Error(`Création de ${c.code} : référentiel illisible (${erreurLecture.message}).`);
    if (existante && existante.length > 0) throw new Error(`Création de ${c.code} : ce code existe déjà dans le référentiel.`);
    const maintenant = new Date().toISOString();
    // Meme forme que les fiches creees a la main dans App A (S302 sert de modele) :
    // dataSource ESTALE, les deux references au meme code, searchNormalized recalcule.
    const ligne = {
      id: crypto.randomUUID(),
      referenceCrypto: c.code,
      referenceEstale: c.code,
      dataSource: "ESTALE",
      name: c.nom,
      address1: c.adresse1,
      postalCode: c.codePostal,
      city: c.ville,
      registrationNumber: c.immatriculation ?? null,
      status: "ACTIVE",
      agencyId: c.agenceId ?? null,
      managerId: c.managerId ?? null,
      mainLotsCount: c.lotsPrincipaux,
      otherLotsCount: c.lotsAutres,
      syndicInitialDate: c.priseEnGestionISO,
      syndicContractEndDate: c.finMandatISO,
      nextAGDate: c.prochaineAgISO ?? null,
      agDurationHours: c.dureeAgHeures,
      agEndMax: c.finMaxAgHeure,
      csCount: c.nbCs,
      csDurationMinutes: c.dureeCsHeures,
      visitCount: c.nbVisites,
      realPostalFees: c.fraisPostauxReels,
      pennylaneId: c.pennylaneId ?? null,
      sdcName: c.nomSdc,
      currentMgmtBilling: "A préparer",
      searchNormalized: `${c.nom} ${c.code} ${c.adresse1} ${c.ville} ${c.codePostal}`.toLowerCase(),
      createdAt: maintenant,
      updatedAt: maintenant,
    };
    const { error } = await supabase.from("Copropriete").insert(ligne);
    // 23505 = unicite violee entre la verification et l'insertion (deux elections en meme temps).
    if (error?.code === "23505") throw new Error(`Création de ${c.code} : ce code vient d'être pris dans le référentiel.`);
    if (error) throw new Error(`Création de ${c.code} : ${error.message}`);
  }

  async perdreCopro(input: CoproPerdueInput): Promise<void> {
    const supabase = createSupabasePublicClient();
    // Le statut vit dans App A : c'est lui que TOUT l'intranet filtre (facturation,
    // alertes, listes). updatedAt rafraichi comme pour les dates.
    const contexte = `Perte de ${input.coproCode}`;
    const id = await idCoproUnique(supabase, input.coproCode, contexte);
    const { data, error } = await supabase
      .from("Copropriete")
      .update({ status: "INACTIVE", updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    exigerUneLigne(contexte, data, error);
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
