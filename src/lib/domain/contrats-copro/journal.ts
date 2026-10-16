// Le journal du module en une phrase française par entrée. Fonction pure.
//
// CONTRAT AVEC LES SERVICES : ce que chaque type attend dans `details`. Un détail absent ne
// casse rien, la phrase se dégrade (« Étape datée » sans la date), mais autant le respecter.
//
//   etape_datee        { etape, dateISO, ancienneDateISO? }     etape = clé ou libellé d'étape
//   etape_effacee      { etape, ancienneDateISO }
//   suivi_demarre      {}
//   cycle_clos         { dateTerminaleISO, echeanceSuivanteISO, offre? }   offre = nom (fournisseur / assureur)
//   cycle_recloture    { dateTerminaleISO, echeanceSuivanteISO, offre? }
//   offre_creee        { fournisseur, montant }
//   offre_retiree      { fournisseur, montant }
//   offre_retenue      { fournisseur }
//   devis_cree         { prestataire, montant }
//   devis_retire       { prestataire, montant }
//   devis_retenu       { prestataire }
//   contrat_corrige    { champ, avant, apres }
//   appareil_cree      { identifiant }
//   appareil_modifie   { champ, avant, apres }
//   document_depose    { nom, typeDocument }                    typeDocument = clé TypeDocument
//   document_retire    { nom }
//   mail_cs_envoye     { objet, a: string[], cc: string[] }
//   rappel_envoye      { a: string[], niveau }                  niveau = vert | orange | rouge
//   suivi_archive      { raison }
//   immeuble_modifie   { champs: string[] }
//   prestataire_lie    { entreprise, metier }                   metier = clé MetierPrestataire
//   prestataire_delie  { entreprise, metier }
//
// Les montants sortent « 4 250 € », les dates « 12/03/2026 », les clés d'étape et de type de
// document sont traduites en libellés quand on les reconnaît.

import { formatEuros } from "@/lib/domain/format-montant";
import { formatJourFR } from "./dates";
import { ETAPES, LIBELLE_METIER, LIBELLE_NIVEAU, LIBELLE_TYPE_DOCUMENT, type EntreeJournalContrats, type MetierPrestataire, type NiveauQualifie, type TypeDocument } from "./types";

type Details = Record<string, unknown>;

function texte(d: Details, cle: string): string | null {
  const v = d[cle];
  if (v === null || v === undefined || v === "") return null;
  return typeof v === "string" ? v : String(v);
}

function montant(d: Details, cle: string): string | null {
  const v = d[cle];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? formatEuros(n, { decimales: "auto" }) : null;
}

function jour(d: Details, cle: string): string | null {
  const v = texte(d, cle);
  return v ? formatJourFR(v) : null;
}

function liste(d: Details, cle: string): string[] {
  const v = d[cle];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : [];
}

/** Clé d'étape -> libellé, en cherchant dans le sujet de l'entrée puis dans tous les sujets. */
function libelleEtape(e: EntreeJournalContrats, cle: string): string {
  const sujets = e.sujet ? [e.sujet] : [];
  for (const s of [...sujets, ...(Object.keys(ETAPES) as (keyof typeof ETAPES)[])]) {
    const def = ETAPES[s].find((x) => x.cle === cle);
    if (def) return def.libelle;
  }
  return cle;
}

function libelleTypeDocument(cle: string | null): string | null {
  if (!cle) return null;
  return (LIBELLE_TYPE_DOCUMENT as Record<string, string>)[cle as TypeDocument] ?? cle;
}

function libelleMetier(cle: string | null): string | null {
  if (!cle) return null;
  return (LIBELLE_METIER as Record<string, string>)[cle as MetierPrestataire] ?? cle;
}

function avecMontant(nom: string | null, m: string | null, defaut: string): string {
  const base = nom ?? defaut;
  return m ? `${base}, ${m}` : base;
}

function correction(d: Details, quoi: string): string {
  const champ = texte(d, "champ");
  const avant = texte(d, "avant");
  const apres = texte(d, "apres");
  const sujet = champ ? `${quoi} : ${champ}` : quoi;
  if (avant && apres) return `${sujet} corrigé de « ${avant} » en « ${apres} »`;
  if (apres) return `${sujet} renseigné : « ${apres} »`;
  if (avant) return `${sujet} effacé (était « ${avant} »)`;
  return `${sujet} corrigé`;
}

function destinataires(a: string[], cc: string[]): string {
  const parts: string[] = [];
  if (a.length) parts.push(`à ${a.join(", ")}`);
  if (cc.length) parts.push(`copie ${cc.join(", ")}`);
  return parts.length ? ` (${parts.join(" ; ")})` : "";
}

/** Une phrase lisible pour une entrée du journal. */
export function texteJournal(e: EntreeJournalContrats): string {
  const d = e.details ?? {};
  switch (e.type) {
    case "etape_datee": {
      const etape = libelleEtape(e, texte(d, "etape") ?? "");
      const date = jour(d, "dateISO");
      const ancienne = jour(d, "ancienneDateISO");
      const corps = date ? `Étape « ${etape} » datée du ${date}` : `Étape « ${etape} » datée`;
      return ancienne ? `${corps} (au lieu du ${ancienne})` : corps;
    }
    case "etape_effacee": {
      const etape = libelleEtape(e, texte(d, "etape") ?? "");
      const ancienne = jour(d, "ancienneDateISO");
      return ancienne ? `Étape « ${etape} » dé-cochée (était datée du ${ancienne})` : `Étape « ${etape} » dé-cochée`;
    }
    case "suivi_demarre":
      return "Suivi démarré";
    case "cycle_clos":
    case "cycle_recloture": {
      const date = jour(d, "dateTerminaleISO");
      const suivante = jour(d, "echeanceSuivanteISO");
      const offre = texte(d, "offre");
      const tete = e.type === "cycle_clos" ? "Cycle clos" : "Clôture corrigée";
      let s = date ? `${tete} le ${date}` : tete;
      if (offre) s += `, offre retenue : ${offre}`;
      if (suivante) s += ` ; prochaine échéance le ${suivante}`;
      return s;
    }
    case "offre_creee":
      return `Offre saisie : ${avecMontant(texte(d, "fournisseur"), montant(d, "montant"), "sans nom")}`;
    case "offre_retiree":
      return `Offre retirée : ${avecMontant(texte(d, "fournisseur"), montant(d, "montant"), "sans nom")}`;
    case "offre_retenue":
      return `Offre retenue : ${avecMontant(texte(d, "fournisseur"), montant(d, "montant"), "sans nom")}`;
    case "devis_cree":
      return `Devis saisi : ${avecMontant(texte(d, "prestataire"), montant(d, "montant"), "sans nom")}`;
    case "devis_retire":
      return `Devis retiré : ${avecMontant(texte(d, "prestataire"), montant(d, "montant"), "sans nom")}`;
    case "devis_retenu":
      return `Devis retenu : ${avecMontant(texte(d, "prestataire"), montant(d, "montant"), "sans nom")}`;
    case "contrat_corrige":
      return correction(d, "Contrat courant");
    case "appareil_cree": {
      const id = texte(d, "identifiant");
      return id ? `Appareil créé : ${id}` : "Appareil créé (sans identifiant)";
    }
    case "appareil_modifie":
      return correction(d, "Appareil");
    case "document_depose": {
      const nom = texte(d, "nom") ?? "sans nom";
      const type = libelleTypeDocument(texte(d, "typeDocument"));
      return type ? `Document « ${nom} » déposé (${type})` : `Document « ${nom} » déposé`;
    }
    case "document_retire":
      return `Document « ${texte(d, "nom") ?? "sans nom"} » retiré`;
    case "mail_cs_envoye": {
      const objet = texte(d, "objet");
      return `Mail envoyé au conseil syndical${objet ? ` : « ${objet} »` : ""}${destinataires(liste(d, "a"), liste(d, "cc"))}`;
    }
    case "rappel_envoye": {
      const niveau = texte(d, "niveau");
      const lib = niveau ? ((LIBELLE_NIVEAU as Record<string, string>)[niveau as NiveauQualifie] ?? niveau) : null;
      return `Rappel d'échéance envoyé${lib ? ` (niveau ${lib.toLowerCase()})` : ""}${destinataires(liste(d, "a"), [])}`;
    }
    case "suivi_archive": {
      const raison = texte(d, "raison");
      return raison ? `Suivi archivé : ${raison}` : "Suivi archivé";
    }
    case "immeuble_modifie": {
      const champs = liste(d, "champs");
      return champs.length ? `Fiche immeuble modifiée : ${champs.join(", ")}` : "Fiche immeuble modifiée";
    }
    case "prestataire_lie": {
      const entreprise = texte(d, "entreprise") ?? "entreprise inconnue";
      const metier = libelleMetier(texte(d, "metier"));
      return metier ? `${entreprise} rattachée comme ${metier.toLowerCase()}` : `${entreprise} rattachée`;
    }
    case "prestataire_delie": {
      const entreprise = texte(d, "entreprise") ?? "entreprise inconnue";
      const metier = libelleMetier(texte(d, "metier"));
      return metier ? `${entreprise} détachée (${metier.toLowerCase()})` : `${entreprise} détachée`;
    }
  }
}
