// Adapters Supabase du module Propositions : les propositions (intranet_proposition) et
// le registre national des coproprietes (intranet_registre_copros, lecture seule).

import type {
  PropositionRepository,
  RegistreCopro,
  RegistreCoprosProvider,
} from "@/lib/ports/proposition-repository";
import type {
  Contact,
  EntreeJournalProposition,
  Immeuble,
  Prix,
  Proposition,
  StatutProposition,
} from "@/lib/domain/proposition/proposition";
import { createSupabasePublicClient } from "./public-client";

type Row = {
  id: string;
  statut: StatutProposition;
  agence: string | null;
  gestionnaire: string | null;
  origine: Proposition["origine"] | null;
  immeuble: Immeuble;
  contact: Contact;
  prix: Prix;
  premier_contact: string | null;
  remise_proposition: string | null;
  ag_prevue: string | null;
  decision: string | null;
  commentaires: string | null;
  copropriete_id: string | null;
  journal: EntreeJournalProposition[];
  cree_par: string;
  created_at: string;
  updated_at: string;
};

const COLS =
  "id, statut, agence, gestionnaire, origine, immeuble, contact, prix, premier_contact, remise_proposition, ag_prevue, decision, commentaires, copropriete_id, journal, cree_par, created_at, updated_at";

function versDomaine(r: Row): Proposition {
  const jour = (v: string | null) => (v ? v.slice(0, 10) : undefined);
  return {
    id: r.id,
    statut: r.statut,
    ...(r.agence ? { agence: r.agence } : {}),
    ...(r.gestionnaire ? { gestionnaire: r.gestionnaire } : {}),
    ...(r.origine ? { origine: r.origine } : {}),
    immeuble: r.immeuble ?? { adresse: "" },
    contact: r.contact ?? {},
    prix: r.prix ?? {},
    ...(jour(r.premier_contact) ? { premierContactISO: jour(r.premier_contact) } : {}),
    ...(jour(r.remise_proposition) ? { remisePropositionISO: jour(r.remise_proposition) } : {}),
    ...(jour(r.ag_prevue) ? { agPrevueISO: jour(r.ag_prevue) } : {}),
    ...(jour(r.decision) ? { decisionISO: jour(r.decision) } : {}),
    ...(r.commentaires ? { commentaires: r.commentaires } : {}),
    ...(r.copropriete_id ? { coproCode: r.copropriete_id } : {}),
    journal: Array.isArray(r.journal) ? r.journal : [],
    creeParNom: r.cree_par,
    creeLeISO: r.created_at.slice(0, 10),
    majLeISO: r.updated_at.slice(0, 10),
  };
}

function versLigne(p: Omit<Proposition, "id" | "creeLeISO" | "majLeISO"> & { id?: string }) {
  return {
    statut: p.statut,
    agence: p.agence ?? null,
    gestionnaire: p.gestionnaire ?? null,
    origine: p.origine ?? null,
    immeuble: p.immeuble,
    contact: p.contact,
    prix: p.prix,
    premier_contact: p.premierContactISO ?? null,
    remise_proposition: p.remisePropositionISO ?? null,
    ag_prevue: p.agPrevueISO ?? null,
    decision: p.decisionISO ?? null,
    commentaires: p.commentaires ?? null,
    copropriete_id: p.coproCode ?? null,
    journal: p.journal,
    cree_par: p.creeParNom,
  };
}

export class SupabasePropositionRepository implements PropositionRepository {
  async lister(filtre?: { statuts?: StatutProposition[]; agence?: string }): Promise<Proposition[]> {
    const supabase = createSupabasePublicClient();
    // PostgREST plafonne chaque reponse a 1 000 lignes : l'historique (1 161 propositions
    // reprises de l'Excel) se lit par pages.
    const PAGE = 1000;
    const lignes: Row[] = [];
    for (let debut = 0; ; debut += PAGE) {
      let q = supabase.from("intranet_proposition").select(COLS).order("updated_at", { ascending: false }).order("id").range(debut, debut + PAGE - 1);
      if (filtre?.statuts?.length) q = q.in("statut", filtre.statuts);
      if (filtre?.agence) q = q.eq("agence", filtre.agence);
      const { data, error } = await q;
      if (error) {
        console.warn(`[propositions] lecture impossible : ${error.message}`);
        return [];
      }
      const page = (data ?? []) as unknown as Row[];
      lignes.push(...page);
      if (page.length < PAGE) break;
    }
    return lignes.map(versDomaine);
  }

  async get(id: string): Promise<Proposition | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("intranet_proposition").select(COLS).eq("id", id).maybeSingle();
    if (error) throw new Error(`Proposition ${id} : ${error.message}`);
    return data ? versDomaine(data as unknown as Row) : null;
  }

  async listerParImmatriculation(immatriculation: string): Promise<Proposition[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_proposition")
      .select(COLS)
      .eq("immeuble->>immatriculation", immatriculation)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn(`[propositions] lecture par immatriculation impossible : ${error.message}`);
      return [];
    }
    return ((data ?? []) as unknown as Row[]).map(versDomaine);
  }

  async creer(p: Omit<Proposition, "id" | "creeLeISO" | "majLeISO">): Promise<Proposition> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase.from("intranet_proposition").insert(versLigne(p)).select(COLS).single();
    if (error || !data) throw new Error(`Création de la proposition : ${error?.message ?? "aucune ligne"}`);
    return versDomaine(data as unknown as Row);
  }

  async sauver(p: Proposition): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_proposition")
      .update({ ...versLigne(p), updated_at: new Date().toISOString() })
      .eq("id", p.id);
    if (error) throw new Error(`Proposition ${p.id} : ${error.message}`);
  }
}

type RowRegistre = {
  immatriculation: string;
  nom_usage: string | null;
  adresse: string;
  adresses_compl: string[] | null;
  code_postal: string;
  commune: string;
  lots_total: number | null;
  lots_principaux: number | null;
  lots_stationnement: number | null;
  periode_construction: string | null;
  syndic_nom: string | null;
  syndic_type: string | null;
  mandat: string | null;
  fin_mandat: string | null;
};

const COLS_REGISTRE =
  "immatriculation, nom_usage, adresse, adresses_compl, code_postal, commune, lots_total, lots_principaux, lots_stationnement, periode_construction, syndic_nom, syndic_type, mandat, fin_mandat";

function registreVersDomaine(r: RowRegistre): RegistreCopro {
  return {
    immatriculation: r.immatriculation,
    nomUsage: r.nom_usage,
    adresse: r.adresse,
    adressesCompl: r.adresses_compl ?? [],
    codePostal: r.code_postal,
    commune: r.commune,
    lotsTotal: r.lots_total,
    lotsPrincipaux: r.lots_principaux,
    lotsStationnement: r.lots_stationnement,
    periodeConstruction: r.periode_construction,
    syndicNom: r.syndic_nom?.trim() || null,
    syndicType: r.syndic_type,
    mandat: r.mandat,
    finMandatISO: r.fin_mandat ? r.fin_mandat.slice(0, 10) : null,
  };
}

/** Meme normalisation que le script d'import : sans accents, sans « rue/av/bd », en minuscules. */
export function normaliserRecherche(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(rue|r|av|ave|avenue|bd|bld|boulevard|pl|place|all|allee|imp|impasse|ch|chemin|sq|square|res|residence)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export class SupabaseRegistreCoprosProvider implements RegistreCoprosProvider {
  async rechercher(texte: string, limite = 10): Promise<RegistreCopro[]> {
    const mots = normaliserRecherche(texte).split(" ").filter((m) => m.length > 1);
    if (mots.length === 0) return [];
    const supabase = createSupabasePublicClient();
    // Tous les mots doivent etre presents (numero, voie, commune ou code postal).
    let q = supabase.from("intranet_registre_copros").select(COLS_REGISTRE).limit(limite);
    for (const m of mots) q = q.ilike("recherche", `%${m}%`);
    const { data, error } = await q;
    if (error) {
      console.warn(`[registre-copros] lecture impossible : ${error.message}`);
      return [];
    }
    return ((data ?? []) as unknown as RowRegistre[]).map(registreVersDomaine);
  }

  async etat(): Promise<{ chargeLeISO: string; nombre: number } | null> {
    const supabase = createSupabasePublicClient();
    const { data, count, error } = await supabase
      .from("intranet_registre_copros")
      .select("importe_le", { count: "exact" })
      .order("importe_le", { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    return { chargeLeISO: String((data[0] as { importe_le: string }).importe_le).slice(0, 10), nombre: count ?? 0 };
  }

  async candidats(numeros: string[], voie: string[]): Promise<RegistreCopro[]> {
    if (numeros.length === 0 || voie.length === 0) return [];
    const supabase = createSupabasePublicClient();
    const vus = new Map<string, RegistreCopro>();
    // Un numero = un mot entier de la colonne de recherche (« 4 » ne ramene ni 14 ni 92400),
    // une requete par numero ecrit.
    for (const n of numeros) {
      let q = supabase.from("intranet_registre_copros").select(COLS_REGISTRE).limit(40);
      q = q.filter("recherche", "imatch", `(^|\\s)${n.replace(/\D/g, "")}(bis|ter|b|t)?(\\s|$)`);
      for (const m of voie) q = q.ilike("recherche", `%${m}%`);
      const { data, error } = await q;
      if (error) {
        console.warn(`[registre-copros] candidats impossibles : ${error.message}`);
        return [];
      }
      for (const r of (data ?? []) as unknown as RowRegistre[]) vus.set(r.immatriculation, registreVersDomaine(r));
    }
    return [...vus.values()];
  }

  async get(immatriculation: string): Promise<RegistreCopro | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_registre_copros")
      .select(COLS_REGISTRE)
      .eq("immatriculation", immatriculation)
      .maybeSingle();
    if (error) return null;
    return data ? registreVersDomaine(data as unknown as RowRegistre) : null;
  }
}
