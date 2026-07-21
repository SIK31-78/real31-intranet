// Template de la checklist de supervision AG. Reprend la fiche REAL31 "450 -
// Couverture AG" (5 phases chronologiques) + une section Verifications comptables.
// Structure metier partagee ; l'ETAT (statut, commentaire, dates) vit dans la table
// intranet_supervision_items. Le "Visa gestionnaire (archivage)" n'est PAS un item :
// c'est la conclusion / visa final (cf. ITEM_CONCLUSION).

export type TypeItem = "check" | "date";

/** Module interne de l'intranet ouvert en modale par l'item (2e porte d'entree). */
export type ModuleItem = "recap" | "depassement_cs";

export interface ItemTemplate {
  id: string;
  libelle: string;
  /** "check" (case a cocher, defaut) ou "date" (vrai champ date renseigne). */
  type?: TypeItem;
  /** Lien externe vers l'app metier concernee (Registre des mandats...). */
  lien?: string;
  /** Ouvre un module interne EN MODALE (recap AG / depassement CS), pre-scope a la
   *  copro courante, au lieu d'un lien externe. Remplace l'ancien renvoi vers Reality. */
  module?: ModuleItem;
}

// Apps externes REAL31 referencees par les items.
const URL_MANDATS = "https://mandats.real31.app/";
export interface SectionTemplate {
  id: string;
  titre: string;
  items: ItemTemplate[];
}

export const SECTIONS_TEMPLATE: SectionTemplate[] = [
  {
    id: "avant-cs",
    titre: "Avant CS",
    items: [
      { id: "avcs.avancement-tx", libelle: "Contrôle avancement travaux + dossiers AG N-1" },
      { id: "avcs.carnet-entretien", libelle: "Carnet d'entretien à jour sur Crypto" },
      { id: "avcs.cs-prepa-date", libelle: "CS préparatoire de l'AG le", type: "date" },
    ],
  },
  {
    id: "apres-cs",
    titre: "Après CS",
    items: [
      { id: "apcs.honos", libelle: "Honoraires CS (horaire dépassé ?)", module: "depassement_cs" },
      { id: "apcs.cr-cs-extranet", libelle: "Compte rendu CS diffusé sur l'extranet" },
      { id: "apcs.suppr-fichiers-n1", libelle: "Suppression des anciens fichiers inutiles AG N-1" },
    ],
  },
  {
    id: "convocation",
    titre: "Convocation",
    items: [
      { id: "conv.date", libelle: "Date de convocation", type: "date" },
      { id: "conv.mail-dispo", libelle: "Mail aux copropriétaires pour annoncer la dispo de la convocation" },
      { id: "conv.agconnect-transfert", libelle: "Si AG Connect : AG transférée + courriers d'invitation envoyés" },
      { id: "conv.agconnect-surplus", libelle: "Si AG Connect et copro > 50 lots : surplus d'abonnement payé (process 471)" },
      { id: "conv.rappel-pouvoirs", libelle: "Relancer pouvoirs / VPC (J-8 avant l'AG)" },
    ],
  },
  {
    id: "documents-ag",
    titre: "Documents pour l'AG (jour J)",
    items: [
      { id: "doc.evenements-attente", libelle: "Vérification des évènements en attente de l'immeuble" },
      { id: "doc.vpc-saisis", libelle: "Tous les VPC saisis (Crypto / AG Connect) + pouvoirs imprimés" },
      { id: "doc.mutations-jourj", libelle: "Mutations vérifiées le jour J (onglet saisie des présences)" },
      { id: "doc.feuille-presence", libelle: "Feuille de présence (5 clés ou tablette si AG Connect)" },
      { id: "doc.contrat-syndic", libelle: "Contrat de syndic (n° mandat G-XXXX à obtenir le jour J)", lien: URL_MANDATS },
      { id: "doc.cr-cs", libelle: "CR réunion CS" },
    ],
  },
  {
    id: "apres-ag",
    titre: "Après AG",
    items: [
      { id: "apag.recap-reality", libelle: "Récap AG", module: "recap" },
      { id: "apag.lre", libelle: "Copros LRE cochés (mail correspondant / Extranet client)" },
      { id: "apag.scan-pv", libelle: "Scan PV + évènement Crypto" },
      { id: "apag.scan-contrat", libelle: "Scan contrat + évènement Crypto (J+2 max)" },
      { id: "apag.tarifs", libelle: "Vérification / mise à jour des tarifs (frais de relance)" },
      { id: "apag.membres-cs", libelle: "Membres CS cochés sur Crypto + mise à jour liste de diffusion" },
      { id: "apag.notif-pv-date", libelle: "Notification du PV le (process 470)", type: "date" },
      { id: "apag.mail-dispo-pv", libelle: "Mails aux copropriétaires pour annoncer la dispo du PV" },
      { id: "apag.registre-pv", libelle: "Registre PV (avec feuille de présence)" },
      { id: "apag.rappel-actions", libelle: "Suivi des actions en cours (décisions et QD)" },
      { id: "apag.dossiers-travaux", libelle: "Dossiers travaux créés et transmis au gestionnaire travaux (454)" },
      { id: "apag.devis-contrats", libelle: "Devis et contrats acceptés" },
      { id: "apag.maj-fiche-immeuble", libelle: "Mise à jour de la fiche immeuble sur Crypto (process 438)" },
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
];

/** Libelle d'un item par son id (pour afficher un probleme sans recharger la section). */
export const ITEM_LIBELLE: Record<string, string> = Object.fromEntries(
  SECTIONS_TEMPLATE.flatMap((s) => s.items.map((i) => [i.id, i.libelle])),
);

/** Id reserve a la ligne de conclusion (visa gestionnaire = dossier archivable). */
export const ITEM_CONCLUSION = "__conclusion__";

/** Item "CS preparatoire le" : sa date alimente le prochain CS de la copro (calendrier). */
export const ITEM_CS_PREPA = "avcs.cs-prepa-date";
