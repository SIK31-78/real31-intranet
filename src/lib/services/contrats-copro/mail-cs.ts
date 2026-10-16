// Le mail au conseil syndical du module « Contrats & contrôles » (plan §3 point 19, décision 9 :
// envoi direct avec prévisualisation, un avertissement avant départ, test sur SE999 avant
// ouverture). Deux temps : `preparerMailCs` compose l'aperçu (modèle, variables, tableau,
// destinataires, signature), le gestionnaire relit et retouche, `envoyerMailCs` recompose et
// envoie depuis SA boîte (auteur.email, jamais un paramètre client).
//
// Modèles : ceux de intranet_mail_modeles dont le titre commence par « Contrats : » (seed
// supabase/sql/intranet_contrats_modeles_mail_seed.sql). Sans modèle en base, un texte de
// secours minimal et un avertissement : rien ne bloque, mais le modèle est à créer.
// Destinataires : la cascade de l'intranet (ESTALE, puis liste Crypto) pour le conseil, moins
// les adresses du cabinet ; le binôme de la copro en copie.
//
// L'AVERTISSEMENT AVANT DÉPART (décision 9) est l'affaire de l'écran : une confirmation qui
// rappelle les destinataires et « ce mail part vraiment » ; le service, lui, refuse ce qui ne
// peut pas partir (module coupé, compte hors pilotes, aucun destinataire, adresse invalide).
//
// PHASE PILOTE (décision 9) : l'envoi n'est ouvert qu'aux comptes de l'allowlist MAIL_PILOTES
// (gate global + allowlist, `mailModuleActifPour`), à la différence du mail de réunion qui ne
// regarde que le gate global. Allowlist vide = tout le monde, une fois le pilote concluant.

import { getGestionnaireRepository, getMailOutboundProvider, getModeleMailRepository, getSignatureProvider } from "@/lib/adapters/router";
import {
  composerMailCs,
  destinatairesMailCs,
  tableauOffres,
  texteVersHtmlMailCs,
  texteVersTexteMailCs,
  titreModeleCs,
  variablesMailCs,
  type DonneesOffresMailCs,
  type SujetSuivi,
  type VarianteMailCs,
} from "@/lib/domain/contrats-copro";
import { mailModuleActif, mailModuleActifPour } from "@/lib/domain/mail-gate";
import { adresseMailValide } from "@/lib/domain/mes-emails-composition";
import { ModelesMailNonConfigureError, type ModeleMailStocke } from "@/lib/domain/modeles-mail";
import { destinatairesConseilSyndical, type SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";
import { exigerPerimetre } from "@/lib/services/coproprietes/exiger-perimetre";
import { coproEnLecture } from "@/lib/services/coproprietes/perimetre-lecture";
import { jourParis } from "@/lib/services/date-du-jour";
import { journaliser } from "./journal";
import { suiviDeCopro } from "./lecture";
import type { AuteurContrats, SuiviCopro } from "./types";

export interface ApercuMailCs {
  /** Les modèles « Contrats : … » proposés (le choisi en premier dans l'écran, pas ici). */
  modeles: { id: string; titre: string }[];
  /** L'id du modèle appliqué ; null = texte de secours (aucun modèle en base). */
  modeleId: string | null;
  objet: string;
  /**
   * Le texte À ÉDITER : variables remplies, le marqueur {{offres}} laissé là où le tableau
   * ira. C'est ce texte, retouché, que l'écran renvoie à `envoyerMailCs`.
   */
  corpsTexte: string;
  /** Le rendu HTML complet (tableau inline), pour la prévisualisation. */
  corpsHtml: string;
  /** Le tableau en lignes de texte, pour montrer ce que {{offres}} deviendra ; null sans marqueur. */
  tableauTexte: string | null;
  a: string[];
  cc: string[];
  sourceDestinataires: SourceDestinataires;
  signatureHtml: string | null;
  avertissements: string[];
}

const PREFIXE_MODELES = "contrats :";
const MESSAGE_MAIL_INACTIF = "L'envoi de mail n'est pas activé sur cet environnement.";
const MESSAGE_HORS_PILOTE = "L'envoi au conseil syndical depuis l'intranet n'est pas encore ouvert à ton compte (phase pilote).";

/** Module coupé -> message environnement ; module actif mais compte hors allowlist -> message pilote. */
function exigerMailOuvertPour(auteur: AuteurContrats): void {
  if (!mailModuleActif()) throw new Error(MESSAGE_MAIL_INACTIF);
  if (!mailModuleActifPour(auteur.email)) throw new Error(MESSAGE_HORS_PILOTE);
}

/** Texte de secours quand le modèle du seed manque en base : court, mais complet. */
function modeleDeRepli(sujet: SujetSuivi, variante: VarianteMailCs): { sujet: string; corps: string } {
  const titre = titreModeleCs(sujet, variante);
  if (variante === "devis_unique") {
    return {
      sujet: "{{copro_nom}} ({{copro_code}}) - Devis à valider",
      corps: "Madame, Monsieur, membres du conseil syndical,\n\nNous vous soumettons le devis suivant :\n\nPrestataire : {{devis_prestataire}}\nMontant : {{devis_montant}}\n\nNous restons à votre disposition et vous remercions de nous faire part de votre accord.",
    };
  }
  return {
    sujet: `{{copro_nom}} ({{copro_code}}) - ${titre.replace(/^Contrats : /, "").replace(/^./, (c) => c.toUpperCase())}`,
    corps: "Bonjour,\n\nVeuillez trouver ci-dessous les propositions reçues :\n\n{{offres}}\n\nNous restons à votre disposition pour échanger sur ces éléments.",
  };
}

/** Les modèles « Contrats : … » actifs ; table absente ou illisible -> aucun (l'aperçu le dit). */
async function modelesContrats(): Promise<ModeleMailStocke[]> {
  try {
    const tous = await getModeleMailRepository().listerTous();
    return tous.filter((m) => m.actif && m.titre.trim().toLowerCase().startsWith(PREFIXE_MODELES)).sort((a, b) => a.titre.localeCompare(b.titre, "fr"));
  } catch (e) {
    if (e instanceof ModelesMailNonConfigureError) return [];
    console.warn("[contrats-copro] modèles de mail illisibles :", (e as Error).message);
    return [];
  }
}

/** Les offres / devis du sujet, tels que le tableau les attend. */
function donneesOffres(suivi: SuiviCopro, sujet: SujetSuivi): DonneesOffresMailCs & { cycleId: string | null } {
  switch (sujet) {
    case "assurance": {
      const enCours = suivi.assurance.cycles.find((v) => v.cycle.statut === "en_cours")?.cycle ?? null;
      return { offresAssurance: suivi.assurance.offres.filter((o) => !enCours || o.cycleId === enCours.id), offreRetenueId: enCours?.offreRetenueId ?? null, cycleId: enCours?.id ?? null };
    }
    case "gaz": {
      const enCours = suivi.gaz.cycles.find((v) => v.cycle.statut === "en_cours")?.cycle ?? null;
      return { offresGaz: suivi.gaz.offres.filter((o) => !enCours || o.cycleId === enCours.id), offreRetenueId: enCours?.offreRetenueId ?? null, cycleId: enCours?.id ?? null };
    }
    case "ctq_ascenseur": {
      const enCours = suivi.ctqAscenseur.appareils.flatMap((a) => a.cycles).find((v) => v.cycle.statut === "en_cours")?.cycle ?? null;
      return { devis: suivi.ctqAscenseur.devis, devisRetenuId: suivi.ctqAscenseur.devisRetenuId, cycleId: enCours?.id ?? null };
    }
    case "ctq_vmc": {
      const enCours = suivi.ctqVmc.cycles.find((v) => v.cycle.statut === "en_cours")?.cycle ?? null;
      return { devis: suivi.ctqVmc.devis, devisRetenuId: suivi.ctqVmc.devisRetenuId, cycleId: enCours?.id ?? null };
    }
  }
}

/**
 * Les e-mails du binôme de la copro (gestionnaire, assistant) : les ids d'équipe du
 * référentiel résolus par le port des gestionnaires. Illisible -> absents (l'aperçu le dit).
 */
async function emailsBinome(coproCode: string): Promise<{ gestionnaire?: string; assistant?: string }> {
  try {
    const copro = await coproEnLecture(coproCode);
    if (!copro) return {};
    const repo = getGestionnaireRepository();
    const [g, a] = await Promise.all([
      copro.managerId ? repo.findById(copro.managerId) : Promise.resolve(null),
      copro.assistantId ? repo.findById(copro.assistantId) : Promise.resolve(null),
    ]);
    return { gestionnaire: g?.email, assistant: a?.email };
  } catch (e) {
    console.warn(`[contrats-copro] binôme de ${coproCode} illisible :`, (e as Error).message);
    return {};
  }
}

async function signatureDe(email: string | undefined): Promise<string | null> {
  if (!email) return null;
  try {
    return await getSignatureProvider().getSignatureHtml(email);
  } catch {
    return null;
  }
}

async function chargerSuivi(coproCode: string, auteurId: string): Promise<SuiviCopro> {
  const suivi = await suiviDeCopro(coproCode, auteurId, jourParis());
  if (!suivi) throw new Error("Copropriété inconnue du référentiel.");
  return suivi;
}

/** Compose l'aperçu du mail : modèle, variables, tableau, destinataires, signature, avertissements. */
export async function preparerMailCs(
  p: { coproCode: string; sujet: SujetSuivi; variante: VarianteMailCs; modeleId?: string },
  auteur: AuteurContrats,
): Promise<ApercuMailCs> {
  await exigerPerimetre(p.coproCode, auteur.id);
  exigerMailOuvertPour(auteur);

  const suivi = await chargerSuivi(p.coproCode, auteur.id);
  const avertissements: string[] = [];

  const [modeles, conseil, binome, signatureHtml] = await Promise.all([
    modelesContrats(),
    destinatairesConseilSyndical(suivi.coproCode),
    emailsBinome(suivi.coproCode),
    signatureDe(auteur.email),
  ]);

  const titreAttendu = titreModeleCs(p.sujet, p.variante);
  const modele = (p.modeleId ? modeles.find((m) => m.id === p.modeleId) : undefined) ?? modeles.find((m) => m.titre.trim() === titreAttendu) ?? null;
  const gabarit = modele ? { sujet: modele.sujet, corps: modele.corps } : modeleDeRepli(p.sujet, p.variante);
  if (!modele) avertissements.push(`Modèle « ${titreAttendu} » absent : texte de secours utilisé, modèle à créer dans /admin/modeles-mail.`);

  const offres = donneesOffres(suivi, p.sujet);
  const tableau = tableauOffres(p.sujet, offres);
  const variables = variablesMailCs({ sujet: p.sujet, copro: { code: suivi.coproCode, nom: suivi.coproNom }, contrat: suivi.contrat, ...offres });
  const compose = composerMailCs({ sujetModele: gabarit.sujet, corpsModele: gabarit.corps, variables, tableau });
  const avecMarqueur = compose.corpsEditable.includes("{{offres}}");
  if (avecMarqueur && tableau.nombre === 0) avertissements.push("Aucune offre à comparer : le tableau dira « Aucune proposition reçue à ce jour. »");
  if (p.variante === "devis_unique" && variables.devis_prestataire === "-") avertissements.push("Aucun devis retenu (ni devis unique) : le prestataire et le montant sont à compléter dans le texte.");

  const destinataires = destinatairesMailCs({ conseil: conseil.emails, gestionnaireEmail: binome.gestionnaire, assistantEmail: binome.assistant });
  if (destinataires.a.length === 0) avertissements.push("Aucune adresse de conseil syndical connue : saisis les destinataires à la main.");
  if (!binome.gestionnaire && !binome.assistant) avertissements.push("Aucun e-mail de gestionnaire ou d'assistant sur cette copropriété : personne du cabinet en copie.");
  if (!signatureHtml) avertissements.push("Signature Signitic indisponible : le mail partira sans signature.");

  return {
    modeles: modeles.map((m) => ({ id: m.id, titre: m.titre })),
    modeleId: modele?.id ?? null,
    objet: compose.objet,
    corpsTexte: compose.corpsEditable,
    corpsHtml: compose.corpsHtml,
    tableauTexte: avecMarqueur ? tableau.texte : null,
    a: destinataires.a,
    cc: destinataires.cc,
    sourceDestinataires: conseil.source,
    signatureHtml,
    avertissements,
  };
}

/**
 * ENVOIE le mail (action irréversible) depuis la boîte de l'auteur, avec le texte relu par le
 * gestionnaire. Le HTML est recomposé depuis ce texte : échappé, le marqueur {{offres}} (s'il
 * l'a laissé) remplacé par le tableau si `tableauInclus`, retiré sinon. Journal `mail_cs_envoye`.
 */
export async function envoyerMailCs(
  p: {
    coproCode: string;
    sujet: SujetSuivi;
    objet: string;
    corpsTexte: string;
    a: string[];
    cc: string[];
    tableauInclus: boolean;
    variante: VarianteMailCs;
    modeleId?: string;
  },
  auteur: AuteurContrats,
): Promise<{ a: string[]; cc: string[] }> {
  await exigerPerimetre(p.coproCode, auteur.id);
  exigerMailOuvertPour(auteur);
  if (!auteur.email) throw new Error("Votre compte n'a pas d'adresse e-mail : impossible d'envoyer depuis votre boîte.");

  const a = nettoyerAdresses(p.a);
  const cc = nettoyerAdresses(p.cc).filter((e) => !a.some((x) => x.toLowerCase() === e.toLowerCase()));
  if (a.length === 0) throw new Error("Aucun destinataire : ajoute au moins une adresse du conseil syndical.");
  const invalide = [...a, ...cc].find((e) => !adresseMailValide(e));
  if (invalide) throw new Error(`Adresse invalide : ${invalide}`);
  const objet = p.objet.replace(/\s+/g, " ").trim();
  if (!objet) throw new Error("L'objet du mail est vide.");
  if (!p.corpsTexte.trim()) throw new Error("Le texte du mail est vide.");

  const suivi = await chargerSuivi(p.coproCode, auteur.id);
  const offres = donneesOffres(suivi, p.sujet);
  const tableau = p.tableauInclus ? tableauOffres(p.sujet, offres) : null;
  const corps = texteVersTexteMailCs(p.corpsTexte, tableau?.texte ?? null);
  const corpsHtml = texteVersHtmlMailCs(p.corpsTexte, tableau?.html ?? null);
  const signatureHtml = await signatureDe(auteur.email);

  await getMailOutboundProvider().envoyerNeuf({
    boite: auteur.email,
    a,
    cc,
    cci: [],
    sujet: objet,
    corps,
    corpsHtml,
    ...(signatureHtml ? { signatureHtml } : {}),
  });

  await journaliser({
    coproCode: suivi.coproCode,
    sujet: p.sujet,
    cycleId: offres.cycleId,
    type: "mail_cs_envoye",
    parUserId: auteur.id,
    parNom: auteur.nom,
    details: { objet, a, cc, variante: p.variante, ...(p.modeleId ? { modeleId: p.modeleId } : {}) },
  });
  return { a, cc };
}

function nettoyerAdresses(liste: readonly string[]): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const brut of liste) {
    const e = brut.trim();
    if (!e || vus.has(e.toLowerCase())) continue;
    vus.add(e.toLowerCase());
    out.push(e);
  }
  return out;
}
