// Adapter Supabase du module Gestion des cles : tables natives intranet_cles_* (ADR-040).
//
// Seul cet adapter connait la forme des tables. Les noms d'entreprise sont joints par la FK
// (pret, reservation) ; les mouvements n'ont pas de FK et sont enrichis par le service.
// Lecture degradee si une table est absente (console.warn + []) ; ecriture = erreur nommee.

import type {
  ClesEntrepriseRepository,
  ClesRepository,
  FiltreMouvements,
  FiltrePrets,
  FiltreReservations,
  NouveauMouvement,
  NouveauPret,
  NouveauTrousseau,
  NouvelleEntreprise,
  NouvelleReservation,
  PageMouvements,
} from "@/lib/ports/cles-repository";
import type {
  Acces,
  Bien,
  Contact,
  ElementComposition,
  Entreprise,
  Mouvement,
  Pret,
  Reservation,
  Trousseau,
  TypeAcces,
} from "@/lib/domain/cles/types";
import { createSupabasePublicClient } from "./public-client";

type AccesRow = {
  id: string;
  trousseau_id: string;
  copropriete_id: string;
  immeuble: string | null;
  types: string[] | null;
  libelle: string;
  ordre: number;
};

type TrousseauRow = {
  id: string;
  agence_code: string;
  numero: string;
  libelle: string;
  emplacement: string | null;
  composition: ElementComposition[] | null;
  photo_chemin: string | null;
  marque: "introuvable" | "retire" | null;
  marque_depuis: string | null;
  jumeau_de: string | null;
  note: string | null;
  source: "intranet" | "import_powerapps";
  cree_par: string;
  created_at: string;
  acces?: AccesRow[];
};

type EntrepriseJointe = { nom: string } | { nom: string }[] | null;

type ReservationRow = {
  id: string;
  trousseau_id: string;
  entreprise_id: string | null;
  contact: Contact | null;
  debut: string;
  fin_prevue: string;
  motif: string | null;
  origine: "interne" | "externe";
  statut: "prevue" | "convertie" | "annulee";
  pret_id: string | null;
  annulee_le: string | null;
  annulee_par: string | null;
  motif_annulation: string | null;
  cree_par: string;
  created_at: string;
  entreprise?: EntrepriseJointe;
};

type PretRow = {
  id: string;
  trousseau_id: string;
  type: "entreprise" | "interne";
  entreprise_id: string | null;
  contact: Contact | null;
  composition: ElementComposition[] | null;
  reservation_id: string | null;
  motif: string | null;
  sorti_le: string;
  sorti_par_id: string | null;
  sorti_par_nom: string;
  retour_prevu_le: string;
  rendu_le: string | null;
  recu_par_id: string | null;
  recu_par_nom: string | null;
  retour_conforme: "complet" | "incomplet" | "endommage" | null;
  commentaire_retour: string | null;
  photo_retour_chemin: string | null;
  entreprise?: EntrepriseJointe;
};

type MouvementRow = {
  id: string;
  trousseau_id: string;
  type: Mouvement["type"];
  horodatage: string;
  par_user_id: string | null;
  par_nom: string;
  agence_code: string;
  entreprise_id: string | null;
  pret_id: string | null;
  reservation_id: string | null;
  corrige_id: string | null;
  details: Record<string, unknown> | null;
};

type EntrepriseRow = {
  id: string;
  nom: string;
  nom_normalise: string;
  telephone: string | null;
  email: string | null;
  adresse: Entreprise["adresse"] | null;
  contacts: Contact[] | null;
  note: string | null;
  statut: "active" | "bloquee";
  motif_blocage: string | null;
  relances: boolean;
  estale_supplier_id: string | null;
  source: "intranet" | "import_powerapps";
  created_at: string;
};

const T_TROUSSEAU = "intranet_cles_trousseau";
const T_ACCES = "intranet_cles_acces";
const T_ENTREPRISE = "intranet_cles_entreprise";
const T_RESERVATION = "intranet_cles_reservation";
const T_PRET = "intranet_cles_pret";
const T_MOUVEMENT = "intranet_cles_mouvement";

const COLS_TROUSSEAU = `id, agence_code, numero, libelle, emplacement, composition, photo_chemin, marque, marque_depuis, jumeau_de, note, source, cree_par, created_at, acces:${T_ACCES}(id, trousseau_id, copropriete_id, immeuble, types, libelle, ordre)`;
const COLS_RESERVATION = `id, trousseau_id, entreprise_id, contact, debut, fin_prevue, motif, origine, statut, pret_id, annulee_le, annulee_par, motif_annulation, cree_par, created_at, entreprise:${T_ENTREPRISE}(nom)`;
const COLS_PRET = `id, trousseau_id, type, entreprise_id, contact, composition, reservation_id, motif, sorti_le, sorti_par_id, sorti_par_nom, retour_prevu_le, rendu_le, recu_par_id, recu_par_nom, retour_conforme, commentaire_retour, photo_retour_chemin, entreprise:${T_ENTREPRISE}(nom)`;
const COLS_MOUVEMENT = "id, trousseau_id, type, horodatage, par_user_id, par_nom, agence_code, entreprise_id, pret_id, reservation_id, corrige_id, details";
const COLS_ENTREPRISE = "id, nom, nom_normalise, telephone, email, adresse, contacts, note, statut, motif_blocage, relances, estale_supplier_id, source, created_at";

const nomJoint = (e: EntrepriseJointe | undefined): string | undefined => {
  if (!e) return undefined;
  const x = Array.isArray(e) ? e[0] : e;
  return x?.nom;
};

function accesVersDomaine(r: AccesRow): Acces {
  return {
    id: r.id,
    bien: { type: "copro", code: r.copropriete_id },
    ...(r.immeuble ? { immeuble: r.immeuble } : {}),
    types: (r.types ?? []) as TypeAcces[],
    libelle: r.libelle ?? "",
    ordre: r.ordre ?? 0,
  };
}

function trousseauVersDomaine(r: TrousseauRow): Trousseau {
  return {
    id: r.id,
    agenceCode: r.agence_code,
    numero: r.numero,
    libelle: r.libelle ?? "",
    ...(r.emplacement ? { emplacement: r.emplacement } : {}),
    composition: Array.isArray(r.composition) ? r.composition : [],
    ...(r.photo_chemin ? { photoChemin: r.photo_chemin } : {}),
    ...(r.marque ? { marque: r.marque } : {}),
    ...(r.marque_depuis ? { marqueDepuisISO: r.marque_depuis } : {}),
    ...(r.jumeau_de ? { jumeauDe: r.jumeau_de } : {}),
    ...(r.note ? { note: r.note } : {}),
    source: r.source,
    creeParNom: r.cree_par,
    creeLeISO: r.created_at,
    acces: (r.acces ?? []).map(accesVersDomaine).sort((a, b) => a.ordre - b.ordre),
  };
}

function reservationVersDomaine(r: ReservationRow): Reservation {
  const nom = nomJoint(r.entreprise);
  return {
    id: r.id,
    trousseauId: r.trousseau_id,
    ...(r.entreprise_id ? { entrepriseId: r.entreprise_id } : {}),
    ...(nom ? { entrepriseNom: nom } : {}),
    ...(r.contact ? { contact: r.contact } : {}),
    debutISO: r.debut.slice(0, 10),
    finPrevueISO: r.fin_prevue.slice(0, 10),
    ...(r.motif ? { motif: r.motif } : {}),
    origine: r.origine,
    statut: r.statut,
    ...(r.pret_id ? { pretId: r.pret_id } : {}),
    ...(r.annulee_le ? { annuleeLeISO: r.annulee_le } : {}),
    ...(r.annulee_par ? { annuleePar: r.annulee_par } : {}),
    ...(r.motif_annulation ? { motifAnnulation: r.motif_annulation } : {}),
    creeParNom: r.cree_par,
    creeLeISO: r.created_at,
  };
}

function pretVersDomaine(r: PretRow): Pret {
  const nom = nomJoint(r.entreprise);
  return {
    id: r.id,
    trousseauId: r.trousseau_id,
    type: r.type,
    ...(r.entreprise_id ? { entrepriseId: r.entreprise_id } : {}),
    ...(nom ? { entrepriseNom: nom } : {}),
    ...(r.contact ? { contact: r.contact } : {}),
    composition: Array.isArray(r.composition) ? r.composition : [],
    ...(r.reservation_id ? { reservationId: r.reservation_id } : {}),
    ...(r.motif ? { motif: r.motif } : {}),
    sortiLeISO: r.sorti_le,
    ...(r.sorti_par_id ? { sortiParId: r.sorti_par_id } : {}),
    sortiParNom: r.sorti_par_nom,
    retourPrevuLeISO: r.retour_prevu_le.slice(0, 10),
    ...(r.rendu_le ? { renduLeISO: r.rendu_le } : {}),
    ...(r.recu_par_id ? { recuParId: r.recu_par_id } : {}),
    ...(r.recu_par_nom ? { recuParNom: r.recu_par_nom } : {}),
    ...(r.retour_conforme ? { retourConforme: r.retour_conforme } : {}),
    ...(r.commentaire_retour ? { commentaireRetour: r.commentaire_retour } : {}),
    ...(r.photo_retour_chemin ? { photoRetourChemin: r.photo_retour_chemin } : {}),
  };
}

function mouvementVersDomaine(r: MouvementRow): Mouvement {
  return {
    id: r.id,
    trousseauId: r.trousseau_id,
    type: r.type,
    horodatageISO: r.horodatage,
    ...(r.par_user_id ? { parUserId: r.par_user_id } : {}),
    parNom: r.par_nom,
    agenceCode: r.agence_code,
    ...(r.entreprise_id ? { entrepriseId: r.entreprise_id } : {}),
    ...(r.pret_id ? { pretId: r.pret_id } : {}),
    ...(r.reservation_id ? { reservationId: r.reservation_id } : {}),
    ...(r.corrige_id ? { corrigeId: r.corrige_id } : {}),
    details: r.details ?? {},
  };
}

function entrepriseVersDomaine(r: EntrepriseRow): Entreprise {
  return {
    id: r.id,
    nom: r.nom,
    nomNormalise: r.nom_normalise,
    ...(r.telephone ? { telephone: r.telephone } : {}),
    ...(r.email ? { email: r.email } : {}),
    ...(r.adresse ? { adresse: r.adresse } : {}),
    contacts: Array.isArray(r.contacts) ? r.contacts : [],
    ...(r.note ? { note: r.note } : {}),
    statut: r.statut,
    ...(r.motif_blocage ? { motifBlocage: r.motif_blocage } : {}),
    relances: r.relances ?? true,
    ...(r.estale_supplier_id ? { estaleSupplierId: r.estale_supplier_id } : {}),
    source: r.source,
    creeLeISO: r.created_at,
  };
}

function accesVersRow(trousseauId: string, a: Omit<Acces, "id">): Omit<AccesRow, "id"> {
  if (a.bien.type !== "copro") {
    // Reserve (Sekou 18/09) : lot locatif / bien en vente viendront par une extension de la table.
    throw new Error(`Accès sur un bien « ${a.bien.type} » : non pris en charge dans cette version.`);
  }
  return {
    trousseau_id: trousseauId,
    copropriete_id: a.bien.code,
    immeuble: a.immeuble ?? null,
    types: a.types,
    libelle: a.libelle,
    ordre: a.ordre,
  };
}

function avertir(contexte: string, message: string): void {
  console.warn(`[cles] ${contexte} : ${message}`);
}

export class SupabaseClesRepository implements ClesRepository {
  async listerTrousseaux(agenceCode?: string): Promise<Trousseau[]> {
    const sb = createSupabasePublicClient();
    let q = sb.from(T_TROUSSEAU).select(COLS_TROUSSEAU).order("numero");
    if (agenceCode) q = q.eq("agence_code", agenceCode);
    const { data, error } = await q.range(0, 4999);
    if (error) {
      avertir("lecture des trousseaux", error.message);
      return [];
    }
    return ((data ?? []) as unknown as TrousseauRow[]).map(trousseauVersDomaine);
  }

  async getTrousseau(id: string): Promise<Trousseau | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_TROUSSEAU).select(COLS_TROUSSEAU).eq("id", id).maybeSingle();
    if (error) throw new Error(`Trousseau ${id} : ${error.message}`);
    return data ? trousseauVersDomaine(data as unknown as TrousseauRow) : null;
  }

  async getTrousseauParNumero(agenceCode: string, numero: string): Promise<Trousseau | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_TROUSSEAU)
      .select(COLS_TROUSSEAU)
      .eq("agence_code", agenceCode)
      .eq("numero", numero)
      .maybeSingle();
    if (error) throw new Error(`Trousseau ${numero} : ${error.message}`);
    return data ? trousseauVersDomaine(data as unknown as TrousseauRow) : null;
  }

  async listerTrousseauxDuBien(bien: Bien): Promise<Trousseau[]> {
    if (bien.type !== "copro") return [];
    const sb = createSupabasePublicClient();
    const { data: acces, error } = await sb.from(T_ACCES).select("trousseau_id").eq("copropriete_id", bien.code);
    if (error) {
      avertir(`trousseaux de ${bien.code}`, error.message);
      return [];
    }
    const ids = [...new Set(((acces ?? []) as { trousseau_id: string }[]).map((a) => a.trousseau_id))];
    if (ids.length === 0) return [];
    const { data, error: e2 } = await sb.from(T_TROUSSEAU).select(COLS_TROUSSEAU).in("id", ids).order("numero");
    if (e2) {
      avertir(`trousseaux de ${bien.code}`, e2.message);
      return [];
    }
    return ((data ?? []) as unknown as TrousseauRow[]).map(trousseauVersDomaine);
  }

  async creerTrousseau(t: NouveauTrousseau): Promise<Trousseau> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_TROUSSEAU)
      .insert({
        agence_code: t.agenceCode,
        numero: t.numero,
        libelle: t.libelle,
        emplacement: t.emplacement ?? null,
        composition: t.composition,
        photo_chemin: t.photoChemin ?? null,
        marque: t.marque ?? null,
        marque_depuis: t.marqueDepuisISO ?? null,
        jumeau_de: t.jumeauDe ?? null,
        note: t.note ?? null,
        source: t.source,
        cree_par: t.creeParNom,
      })
      .select("id")
      .single();
    if (error || !data) {
      const message = error?.message ?? "aucune ligne";
      throw new Error(/duplicate|unique/i.test(message) ? `Le numéro ${t.numero} existe déjà pour l'agence ${t.agenceCode}.` : `Trousseau ${t.numero} : ${message}`);
    }
    const id = (data as { id: string }).id;
    if (t.acces.length > 0) {
      const { error: e2 } = await sb.from(T_ACCES).insert(t.acces.map((a) => accesVersRow(id, a)));
      if (e2) throw new Error(`Accès du trousseau ${t.numero} : ${e2.message}`);
    }
    const cree = await this.getTrousseau(id);
    if (!cree) throw new Error(`Trousseau ${t.numero} : relecture impossible après création.`);
    return cree;
  }

  async sauverTrousseau(t: Trousseau): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(T_TROUSSEAU)
      .update({
        numero: t.numero,
        libelle: t.libelle,
        emplacement: t.emplacement ?? null,
        composition: t.composition,
        photo_chemin: t.photoChemin ?? null,
        marque: t.marque ?? null,
        marque_depuis: t.marqueDepuisISO ?? null,
        jumeau_de: t.jumeauDe ?? null,
        note: t.note ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (error) {
      throw new Error(/duplicate|unique/i.test(error.message) ? `Le numéro ${t.numero} existe déjà pour l'agence ${t.agenceCode}.` : `Trousseau ${t.numero} : ${error.message}`);
    }
    // Les acces sont remplaces en bloc : supprimer puis reinserer (la table n'est pas un journal).
    const { error: eDel } = await sb.from(T_ACCES).delete().eq("trousseau_id", t.id);
    if (eDel) throw new Error(`Accès du trousseau ${t.numero} : ${eDel.message}`);
    if (t.acces.length > 0) {
      const { error: eIns } = await sb.from(T_ACCES).insert(t.acces.map((a) => accesVersRow(t.id, a)));
      if (eIns) throw new Error(`Accès du trousseau ${t.numero} : ${eIns.message}`);
    }
  }

  async listerReservations(f: FiltreReservations): Promise<Reservation[]> {
    const sb = createSupabasePublicClient();
    const cols = f.agenceCode ? `${COLS_RESERVATION}, trousseau:${T_TROUSSEAU}!inner(agence_code)` : COLS_RESERVATION;
    let q = sb.from(T_RESERVATION).select(cols).order("debut", { ascending: true });
    if (f.trousseauId) q = q.eq("trousseau_id", f.trousseauId);
    if (f.entrepriseId) q = q.eq("entreprise_id", f.entrepriseId);
    if (f.statut) q = q.eq("statut", f.statut);
    if (f.deISO) q = q.gte("debut", f.deISO);
    if (f.aISO) q = q.lte("debut", f.aISO);
    if (f.agenceCode) q = q.eq("trousseau.agence_code", f.agenceCode);
    const { data, error } = await q.range(0, 4999);
    if (error) {
      avertir("lecture des réservations", error.message);
      return [];
    }
    return ((data ?? []) as unknown as ReservationRow[]).map(reservationVersDomaine);
  }

  async getReservation(id: string): Promise<Reservation | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_RESERVATION).select(COLS_RESERVATION).eq("id", id).maybeSingle();
    if (error) throw new Error(`Réservation ${id} : ${error.message}`);
    return data ? reservationVersDomaine(data as unknown as ReservationRow) : null;
  }

  async creerReservation(r: NouvelleReservation): Promise<Reservation> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_RESERVATION)
      .insert({
        trousseau_id: r.trousseauId,
        entreprise_id: r.entrepriseId ?? null,
        contact: r.contact ?? null,
        debut: r.debutISO,
        fin_prevue: r.finPrevueISO,
        motif: r.motif ?? null,
        origine: r.origine,
        statut: r.statut,
        pret_id: r.pretId ?? null,
        cree_par: r.creeParNom,
      })
      .select(COLS_RESERVATION)
      .single();
    if (error || !data) throw new Error(`Réservation : ${error?.message ?? "aucune ligne"}`);
    return reservationVersDomaine(data as unknown as ReservationRow);
  }

  async sauverReservation(r: Reservation): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(T_RESERVATION)
      .update({
        entreprise_id: r.entrepriseId ?? null,
        contact: r.contact ?? null,
        debut: r.debutISO,
        fin_prevue: r.finPrevueISO,
        motif: r.motif ?? null,
        statut: r.statut,
        pret_id: r.pretId ?? null,
        annulee_le: r.annuleeLeISO ?? null,
        annulee_par: r.annuleePar ?? null,
        motif_annulation: r.motifAnnulation ?? null,
      })
      .eq("id", r.id);
    if (error) throw new Error(`Réservation ${r.id} : ${error.message}`);
  }

  async getPretOuvert(trousseauId: string): Promise<Pret | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_PRET)
      .select(COLS_PRET)
      .eq("trousseau_id", trousseauId)
      .is("rendu_le", null)
      .maybeSingle();
    if (error) throw new Error(`Prêt ouvert de ${trousseauId} : ${error.message}`);
    return data ? pretVersDomaine(data as unknown as PretRow) : null;
  }

  async listerPrets(f: FiltrePrets): Promise<Pret[]> {
    const sb = createSupabasePublicClient();
    const cols = f.agenceCode ? `${COLS_PRET}, trousseau:${T_TROUSSEAU}!inner(agence_code)` : COLS_PRET;
    let q = sb.from(T_PRET).select(cols).order("sorti_le", { ascending: false });
    if (f.trousseauId) q = q.eq("trousseau_id", f.trousseauId);
    if (f.entrepriseId) q = q.eq("entreprise_id", f.entrepriseId);
    if (f.ouvert === true) q = q.is("rendu_le", null);
    if (f.ouvert === false) q = q.not("rendu_le", "is", null);
    if (f.agenceCode) q = q.eq("trousseau.agence_code", f.agenceCode);
    const { data, error } = await q.range(0, (f.limite ?? 5000) - 1);
    if (error) {
      avertir("lecture des prêts", error.message);
      return [];
    }
    return ((data ?? []) as unknown as PretRow[]).map(pretVersDomaine);
  }

  async getPret(id: string): Promise<Pret | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_PRET).select(COLS_PRET).eq("id", id).maybeSingle();
    if (error) throw new Error(`Prêt ${id} : ${error.message}`);
    return data ? pretVersDomaine(data as unknown as PretRow) : null;
  }

  async creerPret(p: NouveauPret): Promise<Pret> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_PRET)
      .insert({
        trousseau_id: p.trousseauId,
        type: p.type,
        entreprise_id: p.entrepriseId ?? null,
        contact: p.contact ?? null,
        composition: p.composition,
        reservation_id: p.reservationId ?? null,
        motif: p.motif ?? null,
        sorti_le: p.sortiLeISO,
        sorti_par_id: p.sortiParId ?? null,
        sorti_par_nom: p.sortiParNom,
        retour_prevu_le: p.retourPrevuLeISO,
        rendu_le: p.renduLeISO ?? null,
        recu_par_id: p.recuParId ?? null,
        recu_par_nom: p.recuParNom ?? null,
        retour_conforme: p.retourConforme ?? null,
        commentaire_retour: p.commentaireRetour ?? null,
        photo_retour_chemin: p.photoRetourChemin ?? null,
      })
      .select(COLS_PRET)
      .single();
    if (error || !data) {
      const message = error?.message ?? "aucune ligne";
      throw new Error(/duplicate|unique/i.test(message) ? "Ce trousseau est déjà sorti (un prêt est ouvert)." : `Prêt : ${message}`);
    }
    return pretVersDomaine(data as unknown as PretRow);
  }

  async sauverPret(p: Pret): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(T_PRET)
      .update({
        entreprise_id: p.entrepriseId ?? null,
        contact: p.contact ?? null,
        motif: p.motif ?? null,
        sorti_le: p.sortiLeISO,
        retour_prevu_le: p.retourPrevuLeISO,
        rendu_le: p.renduLeISO ?? null,
        recu_par_id: p.recuParId ?? null,
        recu_par_nom: p.recuParNom ?? null,
        retour_conforme: p.retourConforme ?? null,
        commentaire_retour: p.commentaireRetour ?? null,
        photo_retour_chemin: p.photoRetourChemin ?? null,
      })
      .eq("id", p.id);
    if (error) {
      throw new Error(/duplicate|unique/i.test(error.message) ? "Ce trousseau a déjà un prêt ouvert : impossible de rouvrir celui-ci." : `Prêt ${p.id} : ${error.message}`);
    }
  }

  async ajouterMouvement(m: NouveauMouvement): Promise<Mouvement> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_MOUVEMENT)
      .insert({
        trousseau_id: m.trousseauId,
        type: m.type,
        par_user_id: m.parUserId ?? null,
        par_nom: m.parNom,
        agence_code: m.agenceCode,
        entreprise_id: m.entrepriseId ?? null,
        pret_id: m.pretId ?? null,
        reservation_id: m.reservationId ?? null,
        corrige_id: m.corrigeId ?? null,
        details: m.details,
      })
      .select(COLS_MOUVEMENT)
      .single();
    if (error || !data) throw new Error(`Mouvement : ${error?.message ?? "aucune ligne"}`);
    return mouvementVersDomaine(data as unknown as MouvementRow);
  }

  async listerMouvements(f: FiltreMouvements): Promise<PageMouvements> {
    const sb = createSupabasePublicClient();
    let q = sb.from(T_MOUVEMENT).select(COLS_MOUVEMENT, { count: "exact" }).order("horodatage", { ascending: false });
    if (f.agenceCode) q = q.eq("agence_code", f.agenceCode);
    if (f.trousseauId) q = q.eq("trousseau_id", f.trousseauId);
    if (f.entrepriseId) q = q.eq("entreprise_id", f.entrepriseId);
    if (f.types && f.types.length > 0) q = q.in("type", f.types);
    if (f.deISO) q = q.gte("horodatage", `${f.deISO}T00:00:00Z`);
    if (f.aISO) q = q.lte("horodatage", `${f.aISO}T23:59:59Z`);
    if (f.par) q = q.ilike("par_nom", `%${f.par.replace(/[%_]/g, "")}%`);
    const debut = Math.max(0, (f.page - 1) * f.parPage);
    const { data, error, count } = await q.range(debut, debut + f.parPage - 1);
    if (error) {
      avertir("lecture du journal", error.message);
      return { lignes: [], total: 0 };
    }
    return { lignes: ((data ?? []) as unknown as MouvementRow[]).map(mouvementVersDomaine), total: count ?? 0 };
  }
}

export class SupabaseClesEntrepriseRepository implements ClesEntrepriseRepository {
  async lister(): Promise<Entreprise[]> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_ENTREPRISE).select(COLS_ENTREPRISE).order("nom").range(0, 9999);
    if (error) {
      avertir("lecture des entreprises", error.message);
      return [];
    }
    return ((data ?? []) as unknown as EntrepriseRow[]).map(entrepriseVersDomaine);
  }

  async get(id: string): Promise<Entreprise | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_ENTREPRISE).select(COLS_ENTREPRISE).eq("id", id).maybeSingle();
    if (error) throw new Error(`Entreprise ${id} : ${error.message}`);
    return data ? entrepriseVersDomaine(data as unknown as EntrepriseRow) : null;
  }

  async getParNomNormalise(nomNormalise: string): Promise<Entreprise | null> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.from(T_ENTREPRISE).select(COLS_ENTREPRISE).eq("nom_normalise", nomNormalise).maybeSingle();
    if (error) throw new Error(`Entreprise « ${nomNormalise} » : ${error.message}`);
    return data ? entrepriseVersDomaine(data as unknown as EntrepriseRow) : null;
  }

  async creer(e: NouvelleEntreprise): Promise<Entreprise> {
    const sb = createSupabasePublicClient();
    const { data, error } = await sb
      .from(T_ENTREPRISE)
      .insert({
        nom: e.nom,
        nom_normalise: e.nomNormalise,
        telephone: e.telephone ?? null,
        email: e.email ?? null,
        adresse: e.adresse ?? null,
        contacts: e.contacts,
        note: e.note ?? null,
        statut: e.statut,
        motif_blocage: e.motifBlocage ?? null,
        relances: e.relances,
        estale_supplier_id: e.estaleSupplierId ?? null,
        source: e.source,
        cree_par: "intranet",
      })
      .select(COLS_ENTREPRISE)
      .single();
    if (error || !data) {
      const message = error?.message ?? "aucune ligne";
      throw new Error(/duplicate|unique/i.test(message) ? `L'entreprise « ${e.nom} » existe déjà.` : `Entreprise ${e.nom} : ${message}`);
    }
    return entrepriseVersDomaine(data as unknown as EntrepriseRow);
  }

  async sauver(e: Entreprise): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb
      .from(T_ENTREPRISE)
      .update({
        nom: e.nom,
        nom_normalise: e.nomNormalise,
        telephone: e.telephone ?? null,
        email: e.email ?? null,
        adresse: e.adresse ?? null,
        contacts: e.contacts,
        note: e.note ?? null,
        statut: e.statut,
        motif_blocage: e.motifBlocage ?? null,
        relances: e.relances,
        estale_supplier_id: e.estaleSupplierId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.id);
    if (error) {
      throw new Error(/duplicate|unique/i.test(error.message) ? `Une autre entreprise porte déjà le nom « ${e.nom} ».` : `Entreprise ${e.nom} : ${error.message}`);
    }
  }
}
