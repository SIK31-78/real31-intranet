// Template de la checklist de supervision AG (34 items, 5 sections). Structure
// metier partagee mock / reel. L'ETAT (statut, commentaire) vit ailleurs :
// store mock, ou table intranet_supervision_items en reel.

export interface ItemTemplate {
  id: string;
  libelle: string;
}
export interface SectionTemplate {
  id: string;
  titre: string;
  items: ItemTemplate[];
}

export const SECTIONS_TEMPLATE: SectionTemplate[] = [
  {
    id: "logistique",
    titre: "Logistique AG",
    items: [
      { id: "log.date-ag-confirmee", libelle: "Date AG confirmée" },
      { id: "log.lieu-reserve", libelle: "Lieu réservé" },
      { id: "log.modalite-decidee", libelle: "Modalité décidée (présentiel / hybride / visio)" },
      { id: "log.date-limite-odj-communiquee", libelle: "Date limite ajout points ODJ communiquée" },
      { id: "log.mise-sous-pli-planifiee", libelle: "Mise sous pli convocation planifiée" },
    ],
  },
  {
    id: "compta",
    titre: "Vérifications comptables",
    items: [
      { id: "compta.depenses-courantes", libelle: "Dépenses courantes vs budget vérifiées" },
      { id: "compta.travaux-votes", libelle: "Dépenses travaux votés contrôlées" },
      { id: "compta.coherence-102", libelle: "Cohérence comptable classe 102 / budgets ouverts" },
      { id: "compta.compteurs-eau", libelle: "Compteurs eau collectés" },
      { id: "compta.repartiteurs-chauffage", libelle: "Répartiteurs chauffage collectés" },
      { id: "compta.fonds-travaux-vs-places", libelle: "Fonds travaux > fonds placés (502 vs 105)" },
      { id: "compta.debiteurs-anciens", libelle: "Comptes débiteurs / créditeurs anciens propriétaires nettoyés" },
      { id: "compta.solde-sinistre", libelle: "Solde compte sinistre vérifié" },
      { id: "compta.affectations-recup", libelle: "Affectations entretien / réparations contrôlées (récup / loc)" },
    ],
  },
  {
    id: "gestion",
    titre: "Gestion courante",
    items: [
      { id: "ges.sinistres-listes", libelle: "Sinistres en cours listés" },
      { id: "ges.f9-sinistre", libelle: "Dossiers F9 sinistre à jour" },
      { id: "ges.procedures-listees", libelle: "Procédures en cours listées" },
      { id: "ges.f9-travaux", libelle: "Dossiers F9 travaux à jour" },
      { id: "ges.contrat-gaz", libelle: "Contrat gaz renseigné (dates effet / fin + prix molécule)" },
      { id: "ges.contrat-elec", libelle: "Contrat électricité renseigné (dates effet / fin + prix molécule)" },
      { id: "ges.optimisation-engie", libelle: "Optimisation contrat ENGIE étudiée" },
      { id: "ges.dtg-pppt", libelle: "DTG / PPPT : avancement renseigné" },
      { id: "ges.subvention-metropole-dtg", libelle: "Subvention Métropole DTG : statut" },
    ],
  },
  {
    id: "odj",
    titre: "Points ODJ AG suivante",
    items: [
      { id: "odj.rapport-moral-cs", libelle: "Rapport moral CS demandé" },
      { id: "odj.budget-n1", libelle: "Budget N+1 préparé" },
      { id: "odj.fonds-travaux-montant", libelle: "Fonds travaux : montant à proposer décidé" },
      { id: "odj.contrat-syndic", libelle: "Contrat syndic : nouvelle proposition prête" },
      { id: "odj.renouvellement-cs", libelle: "Renouvellement CS : candidatures recueillies" },
      { id: "odj.ppt", libelle: "PPT : décision selon nb lots" },
      { id: "odj.dpe-collectif", libelle: "DPE collectif : décision selon nb lots" },
      { id: "odj.irve", libelle: "IRVE (bornes véhicules électriques) : analyse stationnement" },
      { id: "odj.local-velos", libelle: "Local vélos sécurisé : analyse faite" },
      { id: "odj.ag-hybride", libelle: "AG hybride / visio (AG Connect) : décision CS" },
    ],
  },
  {
    id: "debiteurs",
    titre: "Copropriétaires débiteurs",
    items: [{ id: "deb.liste", libelle: "Liste à jour disponible" }],
  },
];

/** Id reserve a la ligne de conclusion (visa final) dans la table d'etat. */
export const ITEM_CONCLUSION = "__conclusion__";
