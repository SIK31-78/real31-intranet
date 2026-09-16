// L'OFFRE : ce qu'on envoie au prospect une fois la fiche remplie (ADR-039, brique 2).
// Un mail pre-redige (modele du cabinet « Modele_mail_contrat_syndic_REAL31 »), avec en
// piece jointe le contrat de syndic au nom de l'immeuble - le meme gabarit 2026 que
// /contrat, sans copro ni numero de mandat : un « contrat prospect ». Les PDF fixes
// (presentation du service, demarches, modele de resiliation) s'ajoutent a la main dans
// Outlook pour le moment (Sekou, 16/09/2026).
//
// Fonctions pures : aucune lecture de base ni d'horloge.

import { finDeCycle } from "@/lib/domain/contrat/cycle-contrat";
import type { CoproContrat, CycleContratChamps } from "@/lib/domain/contrat/champs-contrat";
import { RESSOURCES_REAL31 } from "@/lib/domain/salles-reunion";
import { COMMUNE_PAR_CODE, normaliser } from "./rapprochement";
import type { Proposition } from "./proposition";

/**
 * L'adresse telle qu'elle ira sur le contrat : sans le suffixe de commune ou de code
 * agence que l'Excel ajoutait (« 16, rue Sébastopol - Courbevoie » -> « 16, rue Sébastopol »),
 * puisque la commune a sa propre ligne.
 */
export function adressePourContrat(adresse: string, commune?: string): string {
  const m = adresse.match(/^(.*?)\s*[-–]\s*([^-–]+)$/);
  if (!m) return adresse.trim();
  const fin = m[2].trim();
  const code = fin.toUpperCase().replace(/[^A-Z]/g, "");
  const estCommune = commune ? normaliser(fin) === normaliser(commune) || normaliser(commune).startsWith(normaliser(fin)) : false;
  return estCommune || COMMUNE_PAR_CODE[code] ? m[1].trim() : adresse.trim();
}

/**
 * Ce que le contrat inclut par defaut dans une offre : les valeurs de 90 % des
 * coproprietes gerees (App A, releve du 16/09/2026 : AG 2 h jusqu'a 20 h, un CS d'une
 * heure, une visite). La fiche de visite peut en decider autrement.
 */
export const INCLUS_OFFRE = {
  dureeAgHeures: 2,
  finMaxAgHeure: 20,
  nbCs: 1,
  dureeCsHeures: 1,
  nbVisites: 1,
} as const;

/** L'immeuble d'une proposition, vu par le gabarit du contrat. */
export function coproContratDepuisProposition(p: Proposition): CoproContrat {
  const im = p.immeuble;
  return {
    code: "",
    nom: im.adresse,
    adresse1: adressePourContrat(im.adresse, im.commune),
    adresse2: "",
    adresse3: "",
    codePostal: im.codePostal ?? "",
    ville: im.commune ?? "",
    immatriculation: im.immatriculation ?? "",
    // L'assurance du syndicat n'est pas connue avant la reprise : la ligne reste vide,
    // elle se complete a la signature.
    assurance: "",
    assuranceDateISO: "",
    agence: p.agence ?? "",
    lotsPrincipaux: im.lotsPrincipaux ?? 0,
    lotsAutres: im.lotsStationnement ?? 0,
    nbVisites: im.visitesPrevues ?? INCLUS_OFFRE.nbVisites,
    dureeAgHeures: INCLUS_OFFRE.dureeAgHeures,
    nbCs: im.csPrevus ?? INCLUS_OFFRE.nbCs,
    dureeCsHeures: INCLUS_OFFRE.dureeCsHeures,
    finMaxAgHeure: INCLUS_OFFRE.finMaxAgHeure,
  };
}

export interface OptionsOffre {
  /** L'AG qui votera le contrat. Defaut : l'AG prevue, sinon la prochaine AG de la fiche. */
  dateAgISO?: string;
  /** Debut du mandat. Defaut : lendemain de la fin du mandat du syndic en place, sinon le jour de l'AG. */
  debutISO?: string;
  /** Duree, en mois. Defaut : 12. */
  dureeMois?: number;
}

/** Le lendemain d'une date ISO. */
function lendemain(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Le cycle propose dans l'offre. La duree est celle que Sekou a demandee au contrat
 * (16/09/2026) ; le debut suit le mandat en place quand on le connait (le registre le
 * donne), sinon l'AG elle-meme.
 */
export function cycleOffre(p: Proposition, options: OptionsOffre, aujourdHuiISO: string): CycleContratChamps {
  const dateAgISO = options.dateAgISO ?? p.agPrevueISO ?? p.immeuble.prochaineAgISO ?? aujourdHuiISO;
  const debutISO =
    options.debutISO ??
    (p.immeuble.finMandatActuelISO && p.immeuble.finMandatActuelISO >= dateAgISO ? lendemain(p.immeuble.finMandatActuelISO) : dateAgISO);
  const finISO = finDeCycle(debutISO, options.dureeMois ?? 12);
  return {
    dateAgISO,
    debutISO,
    finISO,
    honorairesGestionTtc: p.prix.honorairesTtc ?? 0,
    forfaitPostauxTtc: p.prix.fraisPostauxReels ? 0 : (p.prix.timbresTtc ?? 0),
    fraisPostauxReels: p.prix.fraisPostauxReels ?? true,
  };
}

/** Ce qui empeche de faire l'offre, en clair. Vide = on peut y aller. */
export function obstaclesOffre(p: Proposition): string[] {
  const m: string[] = [];
  if (!p.immeuble.lotsPrincipaux) m.push("le nombre de lots principaux");
  if (p.prix.honorairesTtc === undefined) m.push("les honoraires retenus (enregistrer le prix)");
  if (!p.contact.email?.trim() && !p.contact.telephone?.trim()) m.push("un moyen de joindre le contact");
  return m;
}

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € TTC`;

/** Les adresses ou se tiennent les AG d'une agence (« 38 rue Jules Ferry ou 13 rond-point… »). */
export function lieuxAgAgence(agence: string | undefined): string[] {
  if (!agence) return [];
  const adresses = RESSOURCES_REAL31.filter((r) => r.type === "salle" && r.agence === agence && r.adresse).map((r) => r.adresse!.replace(/,\s*\d{5}.*$/, ""));
  return [...new Set(adresses)];
}

export interface SignataireOffre {
  nom: string;
  /** Ex. « REAL 31 Immobilier – Service Syndic de copropriété ». */
  fonction?: string;
}

/**
 * Le mail pre-redige, a copier dans Outlook. Reprend mot pour mot le modele du cabinet
 * (juillet 2026) ; seuls les montants, le lieu d'AG et la signature sont injectes.
 */
export function texteMailOffre(p: Proposition, cycle: CycleContratChamps, signataire: SignataireOffre): string {
  const civilite = /^m(me|adame)\b/i.test(p.contact.nom ?? "") ? "Madame" : /^m(r|onsieur)?\.?\s/i.test(p.contact.nom ?? "") ? "Monsieur" : "Madame, Monsieur";
  const lieux = lieuxAgAgence(p.agence);
  const lieu = lieux.length > 0 ? ` dans notre agence de quartier (${lieux.join(" ou ")})` : "";
  const postaux = cycle.fraisPostauxReels
    ? "Les frais postaux sont refacturés au réel, sur justificatifs, sans marge."
    : `Forfait frais postaux : ${euros(cycle.forfaitPostauxTtc)} par an (réduit de 13 € par copropriétaire optant pour la dématérialisation).`;
  const lots = p.immeuble.lotsPrincipaux ? ` pour ${p.immeuble.lotsPrincipaux} lots principaux` : "";
  const duree = cycle.debutISO && cycle.finISO ? ` (contrat du ${jj(cycle.debutISO)} au ${jj(cycle.finISO)})` : "";

  return [
    `Objet : Votre proposition de contrat de syndic – REAL 31`,
    ``,
    `Bonjour ${civilite},`,
    ``,
    `Je fais suite à nos derniers échanges et vous remercie de votre accueil.`,
    ``,
    `Vous trouverez ci-joint :`,
    `- Notre proposition de contrat ;`,
    `- Une présentation de notre service syndic ;`,
    `- Une fiche de rappel des démarches en cas de changement de syndic ;`,
    `- Un modèle de courrier pour mettre le changement de syndic à l'ordre du jour.`,
    ``,
    `Ce que comprend notre proposition`,
    `- Un compte bancaire séparé ouvert au nom de votre copropriété ;`,
    `- Une assemblée générale annuelle d'une durée de ${INCLUS_OFFRE.dureeAgHeures} heures (jusqu'à ${INCLUS_OFFRE.finMaxAgHeure}h00)${lieu} ;`,
    `- Une réunion de conseil syndical de préparation de l'AG ;`,
    `- Une visite d'immeuble avec rédaction d'un compte rendu.`,
    ``,
    `Notre tarification`,
    `Gestion courante : ${euros(cycle.honorairesGestionTtc)} par an${lots}${duree}.`,
    postaux,
    ``,
    `Un espace en ligne à disposition des copropriétaires`,
    `Notre site Internet permet à chaque copropriétaire de consulter les derniers mouvements de son compte et de régler ses charges par Prélèvement Unique, en complément des modes de paiement classiques (prélèvement automatique trimestriel ou mensuel, virement…).`,
    `Il donne également accès à l'ensemble des documents de la copropriété : appels de fonds, convocations, procès-verbaux d'AG, règlement de copropriété…`,
    `Le conseil syndical bénéficie d'accès dédiés lui permettant de suivre en temps réel l'état des dépenses, au fur et à mesure de la saisie de chaque nouvelle facture, et l'état des impayés de la copropriété.`,
    ``,
    `Un service de proximité et de qualité`,
    `Nous mettons un point d'honneur à offrir un service de qualité à nos copropriétaires. Notre organisation garantit la présence d'un interlocuteur 5 jours par semaine, ainsi qu'une permanence le samedi pour le traitement des urgences.`,
    `L'équipe de gestion est joignable sur de larges horaires : de 09h30 à 12h30 et de 14h00 à 19h30.`,
    ``,
    `Pourquoi choisir REAL 31`,
    `- Une entreprise familiale indépendante depuis 2005, forte de plus de 20 ans d'expertise immobilière.`,
    `- 4 métiers maîtrisés sous un même toit : vente, location, gestion locative et gestion de copropriété.`,
    `- Une adhésion à la FNAIM offrant à nos équipes un accès permanent à une aide juridique et technique.`,
    `- Une mise en concurrence systématique des entreprises pour garantir le juste prix des prestations et la conservation de la valeur de votre patrimoine.`,
    `- Une note moyenne de 4,7/5 sur la base de plus de 430 avis clients.`,
    `- Un extranet copropriétaire accessible 24h/24 pour une transparence totale des charges et des engagements.`,
    ``,
    `Restons en contact`,
    `Je reste à votre disposition pour rencontrer les membres du conseil syndical, si vous le souhaitez, ou pour tout complément d'information. Ce rendez-vous pourra avoir lieu un samedi si cela facilite l'organisation des personnes à rencontrer.`,
    ``,
    `Cordialement,`,
    ``,
    signataire.nom,
    signataire.fonction ?? "REAL 31 Immobilier – Service Syndic de copropriété",
    `Depuis 2005 – 20 ans d'expertise immobilière`,
  ].join("\n");
}

function jj(iso: string): string {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
}
