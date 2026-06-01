// Adapter mock supervision AG.
// STORE module-level : les cochages persistent entre les requetes tant que
// le serveur dev tourne, reset au prochain "pnpm dev".

import type {
  Auditeur,
  SupervisionAgProvider,
} from "@/lib/ports/supervision-ag-provider";
import type {
  ItemChecklist,
  StatutItem,
  SupervisionAg,
  VisaFinal,
} from "@/lib/domain/supervision-ag";

function it(
  id: string,
  libelle: string,
  statut: StatutItem = "non_verifie",
  audite?: { initiales: string; le: string },
  commentaire?: string,
): ItemChecklist {
  return {
    id,
    libelle,
    statut,
    ...(audite ? { audite } : {}),
    ...(commentaire ? { commentaire } : {}),
  };
}

const EL_J1 = { initiales: "EL", le: "2026-05-26T10:15:00Z" };
const EL_J2 = { initiales: "EL", le: "2026-05-25T14:30:00Z" };
const EL_J3 = { initiales: "EL", le: "2026-05-24T09:00:00Z" };
const FA_J2 = { initiales: "FA", le: "2026-05-25T11:00:00Z" };
const FA_J3 = { initiales: "FA", le: "2026-05-24T16:45:00Z" };

function seed(): SupervisionAg[] {
  return [
    {
      // S104 Les Marronniers : AG demain, supervision a mi-parcours, un probleme bloque le visa.
      id: "e1",
      copro: { code: "S104", nomCourt: "Les Marronniers" },
      dateAgCible: "28/05/2026",
      statut: "en_preparation",
      sections: [
        {
          id: "logistique",
          titre: "Logistique AG",
          items: [
            it("log.date-ag-confirmee", "Date AG confirmee", "ok", EL_J3),
            it("log.lieu-reserve", "Lieu reserve", "ok", EL_J3, "Salle paroissiale, a reconfirmer la veille."),
            it("log.modalite-decidee", "Modalite decidee (presentiel / hybride / visio)", "ok", EL_J3, "Presentiel."),
            it("log.date-limite-odj-communiquee", "Date limite ajout points ODJ communiquee", "ok", EL_J2),
            it("log.mise-sous-pli-planifiee", "Mise sous pli convocation planifiee"),
          ],
        },
        {
          id: "compta",
          titre: "Verifications comptables",
          items: [
            it("compta.depenses-courantes", "Depenses courantes vs budget verifiees", "ok", FA_J2),
            it("compta.travaux-votes", "Depenses travaux votes controlees", "probleme", FA_J2, "Devis ravalement non rapproche de la facture finale."),
            it("compta.coherence-102", "Coherence comptable classe 102 / budgets ouverts"),
            it("compta.compteurs-eau", "Compteurs eau collectes", "ok", FA_J3),
            it("compta.repartiteurs-chauffage", "Repartiteurs chauffage collectes"),
            it("compta.fonds-travaux-vs-places", "Fonds travaux > fonds places (502 vs 105)"),
            it("compta.debiteurs-anciens", "Comptes debiteurs / crediteurs anciens proprietaires nettoyes"),
            it("compta.solde-sinistre", "Solde compte sinistre verifie"),
            it("compta.affectations-recup", "Affectations entretien / reparations controlees (recup / loc)"),
          ],
        },
        {
          id: "gestion",
          titre: "Gestion courante",
          items: [
            it("ges.sinistres-listes", "Sinistres en cours listes", "ok", EL_J2),
            it("ges.f9-sinistre", "Dossiers F9 sinistre a jour"),
            it("ges.procedures-listees", "Procedures en cours listees", "ok", EL_J2),
            it("ges.f9-travaux", "Dossiers F9 travaux a jour", "non_applicable", EL_J2, "Aucun chantier en cours."),
            it("ges.contrat-gaz", "Contrat gaz renseigne (dates effet / fin + prix molecule)"),
            it("ges.contrat-elec", "Contrat electricite renseigne (dates effet / fin + prix molecule)"),
            it("ges.optimisation-engie", "Optimisation contrat ENGIE etudiee"),
            it("ges.dtg-pppt", "DTG / PPPT : avancement renseigne"),
            it("ges.subvention-metropole-dtg", "Subvention Metropole DTG : statut"),
          ],
        },
        {
          id: "odj",
          titre: "Points ODJ AG suivante",
          items: [
            it("odj.rapport-moral-cs", "Rapport moral CS demande", "ok", EL_J2),
            it("odj.budget-n1", "Budget N+1 prepare"),
            it("odj.fonds-travaux-montant", "Fonds travaux : montant a proposer decide"),
            it("odj.contrat-syndic", "Contrat syndic : nouvelle proposition prete"),
            it("odj.renouvellement-cs", "Renouvellement CS : candidatures recueillies"),
            it("odj.ppt", "PPT : decision selon nb lots"),
            it("odj.dpe-collectif", "DPE collectif : decision selon nb lots"),
            it("odj.irve", "IRVE (bornes vehicules electriques) : analyse stationnement"),
            it("odj.local-velos", "Local velos securise : analyse faite"),
            it("odj.ag-hybride", "AG hybride / visio (AG Connect) : decision CS"),
          ],
        },
        {
          id: "debiteurs",
          titre: "Coproprietaires debiteurs",
          items: [
            it("deb.liste", "Liste a jour disponible"),
          ],
        },
      ],
    },
    {
      // S067 Residence Nationale : supervision finalisee, aucun probleme, bouton "Conclure" actif.
      id: "e2",
      copro: { code: "S067", nomCourt: "Residence Nationale" },
      dateAgCible: "26/05/2026",
      statut: "en_preparation",
      sections: [
        {
          id: "logistique",
          titre: "Logistique AG",
          items: [
            it("log.date-ag-confirmee", "Date AG confirmee", "ok", EL_J3),
            it("log.lieu-reserve", "Lieu reserve", "ok", EL_J3),
            it("log.modalite-decidee", "Modalite decidee (presentiel / hybride / visio)", "ok", EL_J3),
            it("log.date-limite-odj-communiquee", "Date limite ajout points ODJ communiquee", "ok", EL_J3),
            it("log.mise-sous-pli-planifiee", "Mise sous pli convocation planifiee", "ok", EL_J2),
          ],
        },
        {
          id: "compta",
          titre: "Verifications comptables",
          items: [
            it("compta.depenses-courantes", "Depenses courantes vs budget verifiees", "ok", FA_J2),
            it("compta.travaux-votes", "Depenses travaux votes controlees", "ok", FA_J2),
            it("compta.coherence-102", "Coherence comptable classe 102 / budgets ouverts", "ok", FA_J2),
            it("compta.compteurs-eau", "Compteurs eau collectes", "ok", FA_J3),
            it("compta.repartiteurs-chauffage", "Repartiteurs chauffage collectes", "non_applicable", FA_J3, "Pas de chauffage collectif."),
            it("compta.fonds-travaux-vs-places", "Fonds travaux > fonds places (502 vs 105)", "ok", FA_J2),
            it("compta.debiteurs-anciens", "Comptes debiteurs / crediteurs anciens proprietaires nettoyes", "ok", FA_J2),
            it("compta.solde-sinistre", "Solde compte sinistre verifie", "ok", FA_J2),
            it("compta.affectations-recup", "Affectations entretien / reparations controlees (recup / loc)", "ok", FA_J2),
          ],
        },
        {
          id: "gestion",
          titre: "Gestion courante",
          items: [
            it("ges.sinistres-listes", "Sinistres en cours listes", "ok", EL_J2),
            it("ges.f9-sinistre", "Dossiers F9 sinistre a jour", "ok", EL_J2),
            it("ges.procedures-listees", "Procedures en cours listees", "ok", EL_J2),
            it("ges.f9-travaux", "Dossiers F9 travaux a jour", "ok", EL_J2),
            it("ges.contrat-gaz", "Contrat gaz renseigne (dates effet / fin + prix molecule)", "ok", EL_J1),
            it("ges.contrat-elec", "Contrat electricite renseigne (dates effet / fin + prix molecule)", "ok", EL_J1),
            it("ges.optimisation-engie", "Optimisation contrat ENGIE etudiee", "ok", EL_J1),
            it("ges.dtg-pppt", "DTG / PPPT : avancement renseigne", "ok", EL_J1),
            it("ges.subvention-metropole-dtg", "Subvention Metropole DTG : statut", "ok", EL_J1),
          ],
        },
        {
          id: "odj",
          titre: "Points ODJ AG suivante",
          items: [
            it("odj.rapport-moral-cs", "Rapport moral CS demande", "ok", EL_J2),
            it("odj.budget-n1", "Budget N+1 prepare", "ok", EL_J1),
            it("odj.fonds-travaux-montant", "Fonds travaux : montant a proposer decide", "ok", EL_J1),
            it("odj.contrat-syndic", "Contrat syndic : nouvelle proposition prete", "ok", EL_J1),
            it("odj.renouvellement-cs", "Renouvellement CS : candidatures recueillies", "ok", EL_J1),
            it("odj.ppt", "PPT : decision selon nb lots", "non_applicable", EL_J1, "Moins de 50 lots, PPT non obligatoire."),
            it("odj.dpe-collectif", "DPE collectif : decision selon nb lots", "ok", EL_J1),
            it("odj.irve", "IRVE (bornes vehicules electriques) : analyse stationnement", "ok", EL_J1),
            it("odj.local-velos", "Local velos securise : analyse faite", "ok", EL_J1),
            it("odj.ag-hybride", "AG hybride / visio (AG Connect) : decision CS", "ok", EL_J1),
          ],
        },
        {
          id: "debiteurs",
          titre: "Coproprietaires debiteurs",
          items: [
            it("deb.liste", "Liste a jour disponible", "ok", FA_J2),
          ],
        },
      ],
    },
  ];
}

const STORE = new Map(seed().map((s) => [s.id, s]));

function mutItem(
  ag: SupervisionAg,
  itemId: string,
  patch: (i: ItemChecklist) => ItemChecklist,
): SupervisionAg {
  return {
    ...ag,
    sections: ag.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId ? patch(i) : i)),
    })),
  };
}

export class MockSupervisionAgProvider implements SupervisionAgProvider {
  async getSupervision(agId: string): Promise<SupervisionAg | undefined> {
    return STORE.get(agId);
  }

  async setStatutItem(
    agId: string,
    itemId: string,
    statut: StatutItem,
    auditeur: Auditeur,
  ): Promise<SupervisionAg> {
    const ag = STORE.get(agId);
    if (!ag) throw new Error(`Supervision AG inconnue : ${agId}`);
    if (ag.statut === "conclue_archivee") {
      throw new Error("AG conclue, modification interdite.");
    }
    const next = mutItem(ag, itemId, (i) => ({
      ...i,
      statut,
      audite: { initiales: auditeur.initiales, le: new Date().toISOString() },
    }));
    STORE.set(agId, next);
    return next;
  }

  async setCommentaireItem(
    agId: string,
    itemId: string,
    commentaire: string,
    auditeur: Auditeur,
  ): Promise<SupervisionAg> {
    const ag = STORE.get(agId);
    if (!ag) throw new Error(`Supervision AG inconnue : ${agId}`);
    if (ag.statut === "conclue_archivee") {
      throw new Error("AG conclue, modification interdite.");
    }
    const valeur = commentaire.trim();
    const next = mutItem(ag, itemId, (i) => ({
      ...i,
      commentaire: valeur === "" ? undefined : valeur,
      audite: { initiales: auditeur.initiales, le: new Date().toISOString() },
    }));
    STORE.set(agId, next);
    return next;
  }

  async conclureAg(agId: string, visa: VisaFinal): Promise<SupervisionAg> {
    const ag = STORE.get(agId);
    if (!ag) throw new Error(`Supervision AG inconnue : ${agId}`);
    const next: SupervisionAg = { ...ag, statut: "conclue_archivee", visa };
    STORE.set(agId, next);
    return next;
  }
}
