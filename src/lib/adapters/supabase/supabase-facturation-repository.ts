// Adapter Supabase de la facturation : lit/ecrit les tables natives
// public.intranet_tarifs / intranet_suivi_contrats / intranet_factures /
// intranet_facture_lignes (base patron) via le client public.

import type {
  ContratCopro,
  FactureAEmettre,
  FacturationRepository,
  LigneGestionCourante,
  FactureHistorique,
  NouvelleFacture,
  ParametresCopro,
  Produit,
} from "@/lib/ports/facturation-repository";
import { createSupabasePublicClient } from "./public-client";

type ContratRow = {
  id: string;
  copropriete_id: string;
  debut_contrat: string;
  honoraires_gestion_ttc: number | null;
  forfait_postaux_ttc: number | null;
};

export class SupabaseFacturationRepository implements FacturationRepository {
  async getTarifTtc(identifiantPrestation: string, annee: number): Promise<number | null> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_tarifs")
      .select("montant_ttc")
      .eq("identifiant_prestation", identifiantPrestation)
      .eq("annee", annee)
      .maybeSingle();

    if (error) {
      throw new Error(`Lecture tarif ${identifiantPrestation} (${annee}) : ${error.message}`);
    }
    if (!data) return null;
    return Number((data as { montant_ttc: number }).montant_ttc);
  }

  async getDernierContrat(coproCode: string): Promise<ContratCopro | null> {
    const supabase = createSupabasePublicClient();
    // Contrat EN VIGUEUR = le debut le plus recent qui a deja commence. La liste
    // reprise contient des contrats dates dans le futur (renouvellements saisis
    // en avance) : sans le filtre <= aujourd'hui, on resoudrait le barème sur un
    // contrat pas encore actif.
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("intranet_suivi_contrats")
      .select("id, copropriete_id, debut_contrat, honoraires_gestion_ttc, forfait_postaux_ttc")
      .eq("copropriete_id", coproCode)
      .lte("debut_contrat", aujourdhui)
      .order("debut_contrat", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`Lecture contrat ${coproCode} : ${error.message}`);
    if (!data) return null;

    const r = data as ContratRow;
    return {
      id: r.id,
      coproCode: r.copropriete_id,
      debutContrat: r.debut_contrat,
      ...(r.honoraires_gestion_ttc !== null
        ? { honorairesGestionTtc: Number(r.honoraires_gestion_ttc) }
        : {}),
      ...(r.forfait_postaux_ttc !== null
        ? { forfaitPostauxTtc: Number(r.forfait_postaux_ttc) }
        : {}),
    };
  }

  async chargerProduits(): Promise<Produit[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_produits")
      .select("categorie, agence, titre, pennylane_product_id, ledger_account_id");
    if (error) throw new Error(`Lecture produits : ${error.message}`);
    type Row = {
      categorie: string;
      agence: string;
      titre: string;
      pennylane_product_id: string;
      ledger_account_id: string;
    };
    return ((data as Row[] | null) ?? []).map((r) => ({
      categorie: r.categorie,
      agence: r.agence,
      titre: r.titre,
      pennylaneProductId: r.pennylane_product_id,
      ledgerAccountId: r.ledger_account_id,
    }));
  }

  async getAgenceCopro(coproCode: string): Promise<string | null> {
    const supabase = createSupabasePublicClient();
    // Copropriete.agencyId -> Agency.name (ML/LGC/HLS/ASN).
    const requete = (colonne: string) =>
      supabase
        .from("Copropriete")
        .select('"agencyId", Agency:agencyId (name)')
        .eq(colonne, coproCode)
        .maybeSingle();
    let { data } = await requete("referenceCrypto");
    if (!data) ({ data } = await requete("referenceEstale"));
    const agence = (data as { Agency: { name: string } | null } | null)?.Agency?.name;
    return agence ?? null;
  }

  async chargerGestionCourante(periode: string): Promise<LigneGestionCourante[]> {
    const supabase = createSupabasePublicClient();
    const aujourdhui = new Date().toISOString().slice(0, 10);

    // Contrats deja commences, avec honoraires : on garde le plus recent par copro.
    // frais_postaux_reels : drapeau de la copro. Vrai = frais refactures au reel
    // ailleurs, on ne facture PAS le forfait de timbres trimestriel (cf. plus bas).
    const { data: contrats, error: e1 } = await supabase
      .from("intranet_suivi_contrats")
      .select(
        "copropriete_id, debut_contrat, honoraires_gestion_ttc, forfait_postaux_ttc, frais_postaux_reels",
      )
      .lte("debut_contrat", aujourdhui)
      .not("honoraires_gestion_ttc", "is", null);
    if (e1) throw new Error(`Lecture contrats gestion courante : ${e1.message}`);

    type CRow = {
      copropriete_id: string;
      debut_contrat: string;
      honoraires_gestion_ttc: number;
      forfait_postaux_ttc: number | null;
      frais_postaux_reels: boolean | null;
    };
    const enVigueur = new Map<string, CRow>();
    for (const c of (contrats as CRow[] | null) ?? []) {
      const prec = enVigueur.get(c.copropriete_id);
      if (!prec || c.debut_contrat > prec.debut_contrat) enVigueur.set(c.copropriete_id, c);
    }

    // Copros actives.
    const { data: actives, error: e2 } = await supabase
      .from("Copropriete")
      .select("referenceCrypto")
      .eq("status", "ACTIVE");
    if (e2) throw new Error(`Lecture copros actives : ${e2.message}`);
    const codesActifs = ((actives as { referenceCrypto: string | null }[] | null) ?? [])
      .map((c) => c.referenceCrypto)
      .filter((c): c is string => Boolean(c));

    // Copros deja facturees pour ce trimestre.
    const { data: dejaF, error: e3 } = await supabase
      .from("intranet_factures")
      .select("copropriete_id")
      .eq("type_prestation", "gestion_courante")
      .eq("periode", periode);
    if (e3) throw new Error(`Lecture factures gestion courante : ${e3.message}`);
    const deja = new Set(
      ((dejaF as { copropriete_id: string }[] | null) ?? []).map((f) => f.copropriete_id),
    );

    const lignes: LigneGestionCourante[] = [];
    for (const code of codesActifs) {
      const c = enVigueur.get(code);
      if (!c) continue; // pas de contrat en vigueur : hors base facturable
      lignes.push({
        coproCode: code,
        honorairesAnnuelsTtc: Number(c.honoraires_gestion_ttc),
        forfaitPostauxAnnuel: Number(c.forfait_postaux_ttc ?? 0),
        // Drapeau absent (null) = forfait applique (comportement par defaut du legacy).
        fraisPostauxReels: c.frais_postaux_reels === true,
        dejaFacture: deja.has(code),
      });
    }
    return lignes.sort((a, b) => a.coproCode.localeCompare(b.coproCode, "fr", { numeric: true }));
  }

  /**
   * Cree la facture puis ses lignes.
   *
   * Limite connue : PostgREST ne permet pas de transaction multi-tables. Si
   * l'insertion des lignes echoue, la facture reste sans ligne (statut
   * 'a_facturer', total nul) plutot que d'etre partiellement facturee ; on
   * remonte l'erreur pour que l'appelant la traite.
   */
  async creerFacture(input: NouvelleFacture): Promise<string> {
    const supabase = createSupabasePublicClient();

    const { data, error } = await supabase
      .from("intranet_factures")
      .insert({
        copropriete_id: input.coproCode,
        type_prestation: input.typePrestation,
        libelle: input.libelle,
        date_facture: input.dateFacture,
        date_prestation: input.datePrestation ?? null,
        periode: input.periode ?? null,
        details: input.details ?? null,
        cree_par: input.par ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Creation facture : ${error?.message ?? "aucun id renvoye"}`);
    }
    const factureId = (data as { id: string }).id;

    if (input.lignes.length > 0) {
      const { error: erreurLignes } = await supabase.from("intranet_facture_lignes").insert(
        input.lignes.map((ligne, index) => ({
          facture_id: factureId,
          ordre: index + 1,
          description: ligne.description,
          categorie_produit: ligne.categorieProduit ?? null,
          quantite: ligne.quantite,
          prix_unitaire_ht: ligne.prixUnitaireHt,
          // TOUJOURS renseigne (defaut 0,20 si absent) : dans un insert groupe,
          // PostgREST aligne les colonnes sur l'union des cles, donc une ligne
          // sans taux_tva recevrait NULL (et non le defaut de la colonne) des
          // qu'une autre ligne du lot en porte un. Cf. gestion courante (timbres
          // a 0 % + honoraires sans taux).
          taux_tva: ligne.tauxTva ?? 0.2,
        })),
      );
      if (erreurLignes) {
        throw new Error(`Creation lignes de facture ${factureId} : ${erreurLignes.message}`);
      }
    }

    return factureId;
  }

  async listerFacturesAEmettre(ids: string[]): Promise<FactureAEmettre[]> {
    if (ids.length === 0) return [];
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_factures")
      .select(
        "id, copropriete_id, type_prestation, libelle, date_facture, " +
          "intranet_facture_lignes (description, categorie_produit, quantite, prix_unitaire_ht, taux_tva, ordre)",
      )
      .in("id", ids)
      .eq("statut", "a_facturer")
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Lecture factures a emettre : ${error.message}`);

    type LigneRow = {
      description: string;
      categorie_produit: string | null;
      quantite: number;
      prix_unitaire_ht: number;
      taux_tva: number;
      ordre: number;
    };
    type FactureRow = {
      id: string;
      copropriete_id: string;
      type_prestation: string;
      libelle: string;
      date_facture: string;
      intranet_facture_lignes: LigneRow[] | null;
    };

    return ((data as unknown as FactureRow[] | null) ?? []).map((f) => ({
      id: f.id,
      coproCode: f.copropriete_id,
      typePrestation: f.type_prestation as FactureAEmettre["typePrestation"],
      libelle: f.libelle,
      dateFacture: f.date_facture,
      lignes: [...(f.intranet_facture_lignes ?? [])]
        .sort((a, b) => a.ordre - b.ordre)
        .map((l) => ({
          description: l.description,
          categorieProduit: l.categorie_produit,
          quantite: Number(l.quantite),
          prixUnitaireHt: Number(l.prix_unitaire_ht),
          tauxTva: Number(l.taux_tva),
        })),
    }));
  }

  async creerContrat(input: {
    coproCode: string;
    debutContrat: string;
    honorairesGestionTtc?: number;
    fraisPostauxReels?: boolean;
    forfaitPostauxTtc?: number;
  }): Promise<string> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_suivi_contrats")
      .insert({
        copropriete_id: input.coproCode,
        debut_contrat: input.debutContrat,
        honoraires_gestion_ttc: input.honorairesGestionTtc ?? null,
        frais_postaux_reels: input.fraisPostauxReels ?? null,
        forfait_postaux_ttc: input.forfaitPostauxTtc ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Creation contrat ${input.coproCode} : ${error?.message ?? "aucun id"}`);
    }
    return (data as { id: string }).id;
  }

  async getParametresCopro(coproCode: string): Promise<ParametresCopro | null> {
    const supabase = createSupabasePublicClient();
    // csDurationMinutes contient des HEURES malgre son nom (cf. ParametresCopro).
    const colonnes = "csDurationMinutes, agDurationHours, agStartMin, agEndMax";
    const requete = (colonne: string) =>
      supabase.from("Copropriete").select(colonnes).eq(colonne, coproCode).maybeSingle();

    let { data } = await requete("referenceCrypto");
    if (!data) ({ data } = await requete("referenceEstale"));
    if (!data) return null;

    const r = data as unknown as {
      csDurationMinutes: number | null;
      agDurationHours: number | null;
      agStartMin: number | null;
      agEndMax: number | null;
    };
    // NULL = parametre ABSENT de la fiche (inconnu) : on le laisse a null, on NE
    // met PAS de defaut permissif. Un defaut penche toujours vers la SUR-facturation
    // (franchise CS absente = toute la reunion facturee ; duree d'AG absente = toute
    // l'assemblee facturee). Le service de la prestation concernee levera une erreur
    // actionnable au moment du calcul plutot que de facturer sur une base inconnue.
    // Un 0 EXPLICITE en base reste une valeur valide (0 franchise assumee).
    const nombreOuNull = (v: number | null): number | null => (v === null ? null : Number(v));
    return {
      franchiseCsHeures: nombreOuNull(r.csDurationMinutes),
      dureeAgHeures: nombreOuNull(r.agDurationHours),
      debutMinAgHeure: nombreOuNull(r.agStartMin),
      finMaxAgHeure: nombreOuNull(r.agEndMax),
    };
  }

  async getClientFacturationRef(coproCode: string): Promise<string | null> {
    const supabase = createSupabasePublicClient();
    // pennylaneId vit sur la table Prisma de l'App A (lecture seule ici).
    // referenceCrypto puis referenceEstale : meme resolution que le copro repository.
    const requete = (colonne: string) =>
      supabase.from("Copropriete").select("pennylaneId").eq(colonne, coproCode).maybeSingle();

    let { data } = await requete("referenceCrypto");
    if (!data) ({ data } = await requete("referenceEstale"));

    const ref = (data as { pennylaneId: string | null } | null)?.pennylaneId;
    return ref ? String(ref) : null;
  }

  async marquerFacturee(factureId: string, factureExterneId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_factures")
      .update({
        statut: "facturee",
        pennylane_invoice_id: factureExterneId,
        pennylane_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", factureId);
    if (error) throw new Error(`Marquage facture ${factureId} emise : ${error.message}`);
  }

  async listerFacturesRecentes(limite = 50): Promise<FactureHistorique[]> {
    const supabase = createSupabasePublicClient();
    const { data, error } = await supabase
      .from("intranet_factures")
      .select(
        "id, copropriete_id, type_prestation, libelle, date_facture, statut, " +
          "pennylane_invoice_id, pennylane_error, cree_par, created_at, " +
          "intranet_facture_lignes (quantite, prix_unitaire_ht)",
      )
      .order("created_at", { ascending: false })
      .limit(limite);

    if (error) throw new Error(`Lecture historique facturation : ${error.message}`);

    type Row = {
      id: string;
      copropriete_id: string;
      type_prestation: string;
      libelle: string;
      date_facture: string;
      statut: string;
      pennylane_invoice_id: string | null;
      pennylane_error: string | null;
      cree_par: string | null;
      created_at: string;
      intranet_facture_lignes: Array<{ quantite: number; prix_unitaire_ht: number }> | null;
    };

    return ((data as unknown as Row[] | null) ?? []).map((f) => ({
      id: f.id,
      coproCode: f.copropriete_id,
      typePrestation: f.type_prestation as FactureHistorique["typePrestation"],
      libelle: f.libelle,
      dateFacture: f.date_facture,
      statut: f.statut as FactureHistorique["statut"],
      montantHt: (f.intranet_facture_lignes ?? []).reduce(
        (total, l) => total + Number(l.quantite) * Number(l.prix_unitaire_ht),
        0,
      ),
      ...(f.pennylane_invoice_id ? { factureExterneId: f.pennylane_invoice_id } : {}),
      ...(f.pennylane_error ? { erreur: f.pennylane_error } : {}),
      ...(f.cree_par ? { par: f.cree_par } : {}),
      creeLe: f.created_at,
    }));
  }

  async remettreEnAttente(factureId: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_factures")
      .update({ statut: "a_facturer", updated_at: new Date().toISOString() })
      .eq("id", factureId)
      .eq("statut", "erreur"); // garde-fou : on ne rejoue jamais une facture deja emise
    if (error) throw new Error(`Remise en attente de ${factureId} : ${error.message}`);
  }

  async marquerErreur(factureId: string, message: string): Promise<void> {
    const supabase = createSupabasePublicClient();
    const { error } = await supabase
      .from("intranet_factures")
      .update({
        statut: "erreur",
        pennylane_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", factureId);
    if (error) throw new Error(`Marquage facture ${factureId} en erreur : ${error.message}`);
  }
}
