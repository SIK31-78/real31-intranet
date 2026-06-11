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
            it("log.date-ag-confirmee", "Date AG confirmée", "ok", EL_J3),
            it("log.lieu-reserve", "Lieu réservé", "ok", EL_J3, "Salle paroissiale, à reconfirmer la veille."),
            it("log.modalite-decidee", "Modalité décidée (présentiel / hybride / visio)", "ok", EL_J3, "Présentiel."),
            it("log.date-limite-odj-communiquee", "Date limite ajout points ODJ communiquée", "ok", EL_J2),
            it("log.mise-sous-pli-planifiee", "Mise sous pli convocation planifiée"),
          ],
        },
        {
          id: "compta",
          titre: "Vérifications comptables",
          items: [
            it("compta.depenses-courantes", "Dépenses courantes vs budget vérifiées", "ok", FA_J2),
            it("compta.travaux-votes", "Dépenses travaux votés contrôlées", "probleme", FA_J2, "Devis ravalement non rapproché de la facture finale."),
            it("compta.coherence-102", "Cohérence comptable classe 102 / budgets ouverts"),
            it("compta.compteurs-eau", "Compteurs eau collectés", "ok", FA_J3),
            it("compta.repartiteurs-chauffage", "Répartiteurs chauffage collectés"),
            it("compta.fonds-travaux-vs-places", "Fonds travaux > fonds placés (502 vs 105)"),
            it("compta.debiteurs-anciens", "Comptes débiteurs / créditeurs anciens propriétaires nettoyés"),
            it("compta.solde-sinistre", "Solde compte sinistre vérifié"),
            it("compta.affectations-recup", "Affectations entretien / réparations contrôlées (récup / loc)"),
          ],
        },
        {
          id: "gestion",
          titre: "Gestion courante",
          items: [
            it("ges.sinistres-listes", "Sinistres en cours listés", "ok", EL_J2),
            it("ges.f9-sinistre", "Dossiers F9 sinistre à jour"),
            it("ges.procedures-listees", "Procédures en cours listées", "ok", EL_J2),
            it("ges.f9-travaux", "Dossiers F9 travaux à jour", "non_applicable", EL_J2, "Aucun chantier en cours."),
            it("ges.contrat-gaz", "Contrat gaz renseigné (dates effet / fin + prix molécule)"),
            it("ges.contrat-elec", "Contrat électricité renseigné (dates effet / fin + prix molécule)"),
            it("ges.optimisation-engie", "Optimisation contrat ENGIE étudiée"),
            it("ges.dtg-pppt", "DTG / PPPT : avancement renseigné"),
            it("ges.subvention-metropole-dtg", "Subvention Métropole DTG : statut"),
          ],
        },
        {
          id: "odj",
          titre: "Points ODJ AG suivante",
          items: [
            it("odj.rapport-moral-cs", "Rapport moral CS demandé", "ok", EL_J2),
            it("odj.budget-n1", "Budget N+1 préparé"),
            it("odj.fonds-travaux-montant", "Fonds travaux : montant à proposer décidé"),
            it("odj.contrat-syndic", "Contrat syndic : nouvelle proposition prête"),
            it("odj.renouvellement-cs", "Renouvellement CS : candidatures recueillies"),
            it("odj.ppt", "PPT : décision selon nb lots"),
            it("odj.dpe-collectif", "DPE collectif : décision selon nb lots"),
            it("odj.irve", "IRVE (bornes véhicules électriques) : analyse stationnement"),
            it("odj.local-velos", "Local vélos sécurisé : analyse faite"),
            it("odj.ag-hybride", "AG hybride / visio (AG Connect) : décision CS"),
          ],
        },
        {
          id: "debiteurs",
          titre: "Copropriétaires débiteurs",
          items: [
            it("deb.liste", "Liste à jour disponible"),
          ],
        },
      ],
    },
    {
      // S067 Residence Nationale : supervision finalisee, aucun probleme, bouton "Conclure" actif.
      id: "e2",
      copro: { code: "S067", nomCourt: "Résidence Nationale" },
      dateAgCible: "26/05/2026",
      statut: "en_preparation",
      sections: [
        {
          id: "logistique",
          titre: "Logistique AG",
          items: [
            it("log.date-ag-confirmee", "Date AG confirmée", "ok", EL_J3),
            it("log.lieu-reserve", "Lieu réservé", "ok", EL_J3),
            it("log.modalite-decidee", "Modalité décidée (présentiel / hybride / visio)", "ok", EL_J3),
            it("log.date-limite-odj-communiquee", "Date limite ajout points ODJ communiquée", "ok", EL_J3),
            it("log.mise-sous-pli-planifiee", "Mise sous pli convocation planifiée", "ok", EL_J2),
          ],
        },
        {
          id: "compta",
          titre: "Vérifications comptables",
          items: [
            it("compta.depenses-courantes", "Dépenses courantes vs budget vérifiées", "ok", FA_J2),
            it("compta.travaux-votes", "Dépenses travaux votés contrôlées", "ok", FA_J2),
            it("compta.coherence-102", "Cohérence comptable classe 102 / budgets ouverts", "ok", FA_J2),
            it("compta.compteurs-eau", "Compteurs eau collectés", "ok", FA_J3),
            it("compta.repartiteurs-chauffage", "Répartiteurs chauffage collectés", "non_applicable", FA_J3, "Pas de chauffage collectif."),
            it("compta.fonds-travaux-vs-places", "Fonds travaux > fonds placés (502 vs 105)", "ok", FA_J2),
            it("compta.debiteurs-anciens", "Comptes débiteurs / créditeurs anciens propriétaires nettoyés", "ok", FA_J2),
            it("compta.solde-sinistre", "Solde compte sinistre vérifié", "ok", FA_J2),
            it("compta.affectations-recup", "Affectations entretien / réparations contrôlées (récup / loc)", "ok", FA_J2),
          ],
        },
        {
          id: "gestion",
          titre: "Gestion courante",
          items: [
            it("ges.sinistres-listes", "Sinistres en cours listés", "ok", EL_J2),
            it("ges.f9-sinistre", "Dossiers F9 sinistre à jour", "ok", EL_J2),
            it("ges.procedures-listees", "Procédures en cours listées", "ok", EL_J2),
            it("ges.f9-travaux", "Dossiers F9 travaux à jour", "ok", EL_J2),
            it("ges.contrat-gaz", "Contrat gaz renseigné (dates effet / fin + prix molécule)", "ok", EL_J1),
            it("ges.contrat-elec", "Contrat électricité renseigné (dates effet / fin + prix molécule)", "ok", EL_J1),
            it("ges.optimisation-engie", "Optimisation contrat ENGIE étudiée", "ok", EL_J1),
            it("ges.dtg-pppt", "DTG / PPPT : avancement renseigné", "ok", EL_J1),
            it("ges.subvention-metropole-dtg", "Subvention Métropole DTG : statut", "ok", EL_J1),
          ],
        },
        {
          id: "odj",
          titre: "Points ODJ AG suivante",
          items: [
            it("odj.rapport-moral-cs", "Rapport moral CS demandé", "ok", EL_J2),
            it("odj.budget-n1", "Budget N+1 préparé", "ok", EL_J1),
            it("odj.fonds-travaux-montant", "Fonds travaux : montant à proposer décidé", "ok", EL_J1),
            it("odj.contrat-syndic", "Contrat syndic : nouvelle proposition prête", "ok", EL_J1),
            it("odj.renouvellement-cs", "Renouvellement CS : candidatures recueillies", "ok", EL_J1),
            it("odj.ppt", "PPT : décision selon nb lots", "non_applicable", EL_J1, "Moins de 50 lots, PPT non obligatoire."),
            it("odj.dpe-collectif", "DPE collectif : décision selon nb lots", "ok", EL_J1),
            it("odj.irve", "IRVE (bornes véhicules électriques) : analyse stationnement", "ok", EL_J1),
            it("odj.local-velos", "Local vélos sécurisé : analyse faite", "ok", EL_J1),
            it("odj.ag-hybride", "AG hybride / visio (AG Connect) : décision CS", "ok", EL_J1),
          ],
        },
        {
          id: "debiteurs",
          titre: "Copropriétaires débiteurs",
          items: [
            it("deb.liste", "Liste à jour disponible", "ok", FA_J2),
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

  // Pas de supervision "sans date" en mock : rien a reporter.
  async reporterSansDate(): Promise<void> {}
}
