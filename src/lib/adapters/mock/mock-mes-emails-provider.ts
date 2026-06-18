// Adapter mock du cockpit "Mes emails". Donnees ANONYMISEES (3 copros fictives),
// calquees sur un vrai backtest. Aucune PII. Le vrai branchement (analyse via
// API puis modele local) se fera dans le routeur, sans toucher la vue.

import type { MesEmailsProvider } from "@/lib/ports/mes-emails-provider";
import type { MesEmails } from "@/lib/domain/mes-emails";

const URGENT = { texte: "URGENT", ton: "err" } as const;
const A_TRAITER = { texte: "À TRAITER", ton: "warn" } as const;
const INFO = { texte: "INFO", ton: "neutral" } as const;

// 3 copropriétés (un gestionnaire en suit ~25). SE999 = copro test eStale réelle
// (contexte enrichi depuis eStale par le service) ; les 2 autres restent fictives.
const ESTALE_TEST = { code: "SE999", nom: "Copro test eStale" };
const MARRONNIERS = { code: "S104", nom: "Les Marronniers" };
const SARTORIS = { code: "S045", nom: "Rue Sartoris" };

const SYNDIC = "copropriete@real31.fr";
const GEST = "e.lambert@real31.fr";
const COMPTA = "compta@real31.fr";

const DATA: MesEmails = {
  gestionnaire: { nomComplet: "Élise Lambert", initiales: "EL" },
  nbMailsAnalyses: 4317,
  dateCourante: "12 juin 2026",
  contextes: [], // rempli par le service (enrichissement eStale)

  dossiers: [
    {
      id: "D1",
      label: "Fuite sous-sol - places 48/49",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      type: "sinistre_degat_eaux",
      historique: [
        { date: "2026-06-10", acteur: "M. Bardet", resume: "Relance : la fuite continue, eau sur le véhicule", kind: "mail" },
        { date: "2026-03-13", acteur: "Expert DO", resume: "Expertise réalisée en visioconférence", kind: "jalon" },
        { date: "2026-02-26", acteur: "Syndic", resume: "Convocation à expertise par l'assurance dommages-ouvrage", kind: "action" },
        { date: "2026-02-08", acteur: "Syndic", resume: "Recherche de fuite engagée sur la colonne au-dessus des places", kind: "action" },
        { date: "2026-02-06", acteur: "M. Barroso", resume: "Signalement initial de la fuite, places 48/49", kind: "mail" },
      ],
    },
    {
      id: "D2",
      label: "Borne de recharge - installation",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      type: "panne_intervention",
      historique: [
        { date: "2026-03-12", acteur: "Prestataire", resume: "Raccordement du point de livraison réalisé", kind: "jalon" },
        { date: "2026-02-17", acteur: "Prestataire", resume: "Travaux préparatoires effectués", kind: "action" },
        { date: "2026-01-23", acteur: "Syndic", resume: "Courrier recommandé envoyé au prestataire et au distributeur", kind: "pj" },
        { date: "2025-12-08", acteur: "Conseil syndical", resume: "1ère intervention non honorée, retards signalés", kind: "mail" },
      ],
    },
    {
      id: "D3",
      label: "Gestion des badges VIGIK",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      type: "comptabilite",
      historique: [
        { date: "2026-05-26", acteur: "Comptabilité", resume: "Montant de facturation corrigé (18,48 €)", kind: "action" },
      ],
    },
    {
      id: "D4",
      label: "Ascenseur bâtiment A - pannes",
      coproCode: MARRONNIERS.code,
      coproNom: MARRONNIERS.nom,
      type: "panne_intervention",
      historique: [
        { date: "2026-05-07", acteur: "Ascensoriste", resume: "Intervention : redémarrage après blocage au 3e étage", kind: "jalon" },
        { date: "2026-05-04", acteur: "M. Lefort", resume: "Signalement d'une panne, cabine bloquée", kind: "mail" },
        { date: "2026-03-15", acteur: "Syndic", resume: "Contrat de maintenance renouvelé", kind: "pj" },
      ],
    },
    {
      id: "D5",
      label: "Appels de fonds 2026",
      coproCode: SARTORIS.code,
      coproNom: SARTORIS.nom,
      type: "comptabilite",
      historique: [
        { date: "2026-04-23", acteur: "Comptabilité", resume: "Appels de fonds du 2e trimestre émis", kind: "action" },
        { date: "2026-01-06", acteur: "Syndic", resume: "Mise en place du prélèvement SEPA", kind: "action" },
      ],
    },
  ],

  mails: [
    {
      id: "m1",
      de: "M. Bardet (copropriétaire)",
      expediteurEmail: "jean.bardet@gmail.com",
      destinataires: [SYNDIC],
      copie: ["cs.belvedere@gmail.com"],
      objet: "Re : Fuite sous-sol - places 48/49",
      date: "2026-06-10",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: false,
      corps:
        "Bonjour,\n\nLa fuite au sous-sol est toujours aussi importante, voire pire. L'eau continue de se déverser sur mon véhicule et je ne peux pas le laver tous les jours. Quelle solution me proposez-vous ?\n\nDans l'attente d'un retour rapide.\nCordialement,\nJean Bardet",
      attachments: [{ nom: "Constat dégât des eaux.pdf" }],
      type: "sinistre_degat_eaux",
      ticketable: true,
      priorite: "late",
      badge: URGENT,
      rattachement: { statut: "existant", dossierId: "D1", dossierLabel: "Fuite sous-sol - places 48/49", confiance: 92 },
      brouillonReponse:
        "Monsieur Bardet,\n\nNous accusons réception de votre message. Le dossier sinistre est en cours auprès de notre assurance dommages-ouvrage ; nous transmettons ce jour les éléments à l'expert et revenons vers vous avec une date d'intervention sous 8 jours.\n\nNous restons à votre disposition.\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Accuser réception au copropriétaire" },
        { ordre: 2, libelle: "Relancer l'expert dommages-ouvrage" },
        { ordre: 3, libelle: "Mettre à jour le dossier sinistre" },
      ],
    },
    {
      id: "m2",
      de: "Fodé Souaré (prestataire)",
      expediteurEmail: "f.souare@prestataire-borne.fr",
      destinataires: [GEST],
      copie: [],
      objet: "Re : Mise en service de la borne",
      date: "2026-06-09",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: false,
      corps:
        "Bonjour Madame Lambert,\n\nL'intervention de ce matin s'est bien passée : le raccordement du point de livraison est réalisé. La prochaine étape est la mise en exploitation, nous sommes en attente de la date de la part du distributeur.\n\nJe reviens vers vous dès réception du planning.\nCordialement,\nFodé Souaré",
      attachments: [{ nom: "CR intervention.pdf" }, { nom: "Plans.pdf" }],
      type: "panne_intervention",
      ticketable: true,
      priorite: "late",
      badge: URGENT,
      rattachement: { statut: "existant", dossierId: "D2", dossierLabel: "Borne de recharge - installation", confiance: 88 },
      brouillonReponse:
        "Bonjour,\n\nPoint d'avancement sur la borne de recharge : le raccordement est réalisé, nous sommes en attente de la date de mise en service par le distributeur. Nous relançons le prestataire et le distributeur ce jour et vous tenons informés dès réception du planning.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Relancer le distributeur sur la date de mise en service" },
        { ordre: 2, libelle: "Faire un point écrit au Conseil syndical" },
        { ordre: 3, libelle: "Mettre à jour le dossier" },
      ],
    },
    {
      id: "m7",
      de: "M. Lefort (copropriétaire)",
      expediteurEmail: "m.lefort@orange.fr",
      destinataires: [SYNDIC],
      copie: ["cs.marronniers@gmail.com"],
      objet: "Ascenseur bâtiment A de nouveau en panne",
      date: "2026-06-08",
      coproCode: MARRONNIERS.code,
      coproNom: MARRONNIERS.nom,
      lu: false,
      corps:
        "Bonjour,\n\nL'ascenseur du bâtiment A est de nouveau en panne, la cabine est bloquée. C'est très problématique pour les personnes âgées de l'immeuble. Merci d'intervenir rapidement.\n\nCordialement,\nMichel Lefort",
      attachments: [],
      type: "panne_intervention",
      ticketable: true,
      priorite: "late",
      badge: URGENT,
      rattachement: { statut: "existant", dossierId: "D4", dossierLabel: "Ascenseur bâtiment A - pannes", confiance: 90 },
      brouillonReponse:
        "Monsieur Lefort,\n\nNous accusons réception de votre signalement concernant l'ascenseur du bâtiment A. Nous missionnons l'ascensoriste en urgence et informons l'immeuble par affichette. Nous revenons vers vous dès que l'intervention est planifiée.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Missionner l'ascensoriste en urgence" },
        { ordre: 2, libelle: "Informer les copropriétaires (affichette hall)" },
      ],
    },
    {
      id: "m4",
      de: "M. Gaudin (copropriétaire)",
      expediteurEmail: "d.gaudin@free.fr",
      destinataires: [GEST],
      copie: [],
      objet: "Interphone hors service - appartement D101",
      date: "2026-06-03",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: false,
      corps:
        "Bonjour,\n\nMon interphone ne fonctionne pas, je ne l'ai d'ailleurs jamais utilisé depuis mon emménagement. Il est important de faire intervenir un technicien, il en va de la sécurité de mon logement.\n\nMerci d'avance.\nDaniel Gaudin, appartement D101",
      attachments: [],
      type: "panne_intervention",
      ticketable: true,
      priorite: "late",
      badge: URGENT,
      rattachement: { statut: "nouveau", dossierId: "N1", dossierLabel: "Interphone - appartement D101" },
      brouillonReponse:
        "Monsieur Gaudin,\n\nNous accusons réception de votre signalement concernant l'interphone de l'appartement D101. Nous missionnons un technicien et vous communiquons la date d'intervention dès que possible.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Missionner un technicien interphone" },
        { ordre: 2, libelle: "Accuser réception au copropriétaire" },
      ],
    },
    {
      id: "m9",
      de: "Entreprise Ravalys (prestataire)",
      expediteurEmail: "contact@ravalys.fr",
      destinataires: [SYNDIC],
      copie: [],
      objet: "Devis ravalement de façade - Rue Sartoris",
      date: "2026-06-02",
      coproCode: SARTORIS.code,
      coproNom: SARTORIS.nom,
      lu: false,
      corps:
        "Bonjour,\n\nSuite à notre visite sur place, vous trouverez ci-joint notre devis pour le ravalement de la façade côté rue. Nous restons à votre disposition pour toute précision.\n\nCordialement,\nEntreprise Ravalys",
      attachments: [{ nom: "Devis ravalement façade.pdf" }],
      type: "devis_validation",
      ticketable: true,
      priorite: "soon",
      badge: A_TRAITER,
      rattachement: { statut: "nouveau", dossierId: "N2", dossierLabel: "Ravalement façade - devis" },
      brouillonReponse:
        "Bonjour,\n\nNous accusons réception de votre devis pour le ravalement de la façade. Nous le soumettons au Conseil syndical pour validation et reviendrons vers vous.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Transmettre le devis au Conseil syndical pour validation" },
        { ordre: 2, libelle: "Inscrire le point à l'ordre du jour de l'AG si retenu" },
      ],
    },
    {
      id: "m3",
      de: "Mme Tessier (copropriétaire)",
      expediteurEmail: "claire.tessier@gmail.com",
      destinataires: [SYNDIC],
      copie: ["cs.belvedere@gmail.com"],
      objet: "Proposition - adoucisseur d'eau (pour l'AG)",
      date: "2026-05-26",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: true,
      corps:
        "Bonjour,\n\nJe vous contacte concernant la dureté de l'eau dans notre résidence, qui est très calcaire. Serait-il possible d'étudier l'installation d'un adoucisseur et de porter ce point à la prochaine assemblée générale ?\n\nMerci,\nClaire Tessier",
      attachments: [],
      type: "demande_copro_cs",
      ticketable: true,
      priorite: "soon",
      badge: A_TRAITER,
      rattachement: { statut: "nouveau", dossierId: "N3", dossierLabel: "Adoucisseur d'eau - à porter en AG" },
      brouillonReponse:
        "Madame Tessier,\n\nMerci pour votre proposition concernant l'installation d'un adoucisseur d'eau. Nous sollicitons un devis et inscrirons ce point à l'ordre du jour de la prochaine assemblée générale pour décision des copropriétaires.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Demander un devis d'adoucisseur" },
        { ordre: 2, libelle: "Inscrire le point à l'ordre du jour de l'AG" },
      ],
    },
    {
      id: "m8",
      de: "Mme Aubry (copropriétaire)",
      expediteurEmail: "s.aubry@wanadoo.fr",
      destinataires: [COMPTA],
      copie: [],
      objet: "Demande de relevé de charges 2025",
      date: "2026-05-24",
      coproCode: MARRONNIERS.code,
      coproNom: MARRONNIERS.nom,
      lu: true,
      corps:
        "Bonjour,\n\nPourriez-vous m'adresser mon décompte individuel de charges pour l'année 2025 ? J'en ai besoin pour ma déclaration.\n\nMerci d'avance.\nSophie Aubry",
      attachments: [],
      type: "comptabilite",
      ticketable: true,
      priorite: "soon",
      badge: A_TRAITER,
      rattachement: { statut: "nouveau", dossierId: "N4", dossierLabel: "Relevé de charges - Mme Aubry" },
      brouillonReponse:
        "Madame Aubry,\n\nVeuillez trouver ci-joint votre décompte individuel de charges pour l'exercice 2025. Nous restons à votre disposition pour toute question.\n\nBien cordialement,",
      flow: [{ ordre: 1, libelle: "Éditer et envoyer le décompte de charges 2025" }],
    },
    {
      id: "m10",
      de: "Banque (prélèvements)",
      expediteurEmail: "prelevements@banque-adb.fr",
      destinataires: [COMPTA],
      copie: [],
      objet: "Prélèvement SEPA rejeté - 200 €",
      date: "2026-05-21",
      coproCode: SARTORIS.code,
      coproNom: SARTORIS.nom,
      lu: true,
      corps:
        "Madame, Monsieur,\n\nNous vous informons qu'un prélèvement SEPA d'un montant de 200 € a été rejeté pour provision insuffisante. Merci de procéder à la régularisation dans les meilleurs délais.\n\nCordialement,\nService prélèvements",
      attachments: [],
      type: "comptabilite",
      ticketable: true,
      priorite: "soon",
      badge: A_TRAITER,
      rattachement: { statut: "existant", dossierId: "D5", dossierLabel: "Appels de fonds 2026", confiance: 79 },
      brouillonReponse:
        "Bonjour,\n\nNous vous informons qu'un prélèvement de vos charges a été rejeté pour défaut de provision. Merci de bien vouloir procéder à la régularisation sous huitaine. Nous restons à votre disposition.\n\nBien cordialement,",
      flow: [{ ordre: 1, libelle: "Relancer le copropriétaire pour régularisation" }],
    },
    {
      id: "m5",
      de: "M. Roy (copropriétaire)",
      expediteurEmail: "p.roy@gmail.com",
      destinataires: [SYNDIC],
      copie: [],
      objet: "Dégradations parties communes + caméra non autorisée",
      date: "2026-05-22",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: true,
      corps:
        "Bonjour,\n\nJe vous signale plusieurs aménagements réalisés par le copropriétaire du rez-de-chaussée qui semblent non autorisés, ainsi que l'installation d'une caméra orientée vers les parties communes.\n\nPouvez-vous vérifier ce point ?\nCordialement,\nPatrick Roy",
      attachments: [],
      type: "demande_copro_cs",
      ticketable: true,
      priorite: "soon",
      badge: A_TRAITER,
      rattachement: { statut: "nouveau", dossierId: "N5", dossierLabel: "Aménagements RDC - conformité" },
      brouillonReponse:
        "Monsieur Roy,\n\nNous vous remercions pour votre signalement. Nous vérifions si ces installations ont fait l'objet d'une autorisation de l'assemblée et reviendrons vers vous. Le cas échéant, un rappel au règlement de copropriété sera adressé.\n\nBien cordialement,",
      flow: [
        { ordre: 1, libelle: "Vérifier l'autorisation en assemblée" },
        { ordre: 2, libelle: "Répondre au signalant" },
      ],
    },
    {
      id: "m6",
      de: "Comptabilité (interne)",
      expediteurEmail: COMPTA,
      destinataires: [GEST],
      copie: [],
      objet: "Re : Facturation VIGIK",
      date: "2026-05-26",
      coproCode: ESTALE_TEST.code,
      coproNom: ESTALE_TEST.nom,
      lu: true,
      corps: "OK, je change le montant à 18,48 €.\n\nElsa, comptabilité",
      attachments: [],
      type: "comptabilite",
      ticketable: false,
      priorite: "ok",
      badge: INFO,
      rattachement: { statut: "existant", dossierId: "D3", dossierLabel: "Gestion des badges VIGIK", confiance: 81 },
      flow: [],
    },
  ],
};

export class MockMesEmailsProvider implements MesEmailsProvider {
  async getMesEmails(): Promise<MesEmails> {
    return DATA;
  }
}
