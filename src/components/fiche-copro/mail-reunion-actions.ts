"use server";

// Server actions du mail au conseil syndical (increment 2 "dates CS/AG"). UN SEUL mail
// PROPOSE les dates a venir (CS preparatoire + AG ensemble, verbatim cabinet). Deux
// temps, separes par une RELECTURE humaine (jamais d'envoi automatique) :
//   1. preparerMailReunionAction : compose un brouillon (destinataires + objet + corps)
//      a partir des donnees SERVEUR (copro, dates, heures, modes, salles) -> relu.
//   2. envoyerMailReunionAction : envoie REELLEMENT apres son clic (confirmation UI).
//
// Chaque action : (1) VALIDE ses entrees (zod : endpoint POST public) ; (2) resout le
// gestionnaire + verifie le cloisonnement copro (coproAppartient, anti-IDOR) ; (3) applique
// le DOUBLE GATE mail (MAIL_SOURCE=graph + allowlist MAIL_PILOTES) via mailModuleActifPour.
// La boite d'envoi = email de SESSION (jamais un parametre client).

import { z } from "zod";
import { getGestionnaireCourant, mailModuleActifPour } from "@/lib/auth/session";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getCoproRepository } from "@/lib/adapters/router";
import { getConfirmations } from "@/lib/services/coproprietes/confirmation-evenement";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import type { ConfirmationEvenement } from "@/lib/domain/confirmation-evenement";
import {
  corpsMailDatesReunion,
  objetMailDatesReunion,
  dateConfirmationJ7,
  type DateReunionMail,
  type InfosMailDatesReunion,
} from "@/lib/domain/mail-reunion";
import {
  destinatairesConseilSyndical,
  type SourceDestinataires,
} from "@/lib/services/coproprietes/destinataires-conseil";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { envoyerMailReunion } from "@/lib/services/coproprietes/envoyer-mail-reunion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zCode = z.string().trim().min(1).max(40);
const zSujet = z.string().trim().min(1).max(2000);
const zCorps = z.string().min(1).max(100_000);
const zEmails = z.array(z.string().trim().max(320)).max(50);

type PreparerResult =
  | { ok: true; source: SourceDestinataires; emails: string[]; sujet: string; corps: string }
  | { ok: false; message: string };

type EnvoiResult = { ok: true } | { ok: false; message: string };

/** Auth + cloisonnement + double gate mail. Renvoie le gestionnaire (avec sa boite) si OK. */
async function garde(
  coproCode: string,
): Promise<{ ok: true; g: { id: string; email: string } } | { ok: false; message: string }> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expirée, reconnectez-vous." };
  if (!mailModuleActifPour(g.email)) {
    return { ok: false, message: "L'envoi de mail n'est pas encore activé pour votre compte." };
  }
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id))) {
    return { ok: false, message: "Copropriété hors de votre périmètre." };
  }
  if (!g.email) return { ok: false, message: "Aucune boîte associée à ce compte." };
  return { ok: true, g: { id: g.id, email: g.email } };
}

/**
 * Construit le fragment "date proposee" d'un type (CS / AG) SI la date est a venir.
 * Mode + salle sont portes par la confirmation ; la salle n'est reprise dans le mail
 * que si le mode est presentiel / hybride (logique du modele).
 */
function dateAProposer(
  dateISO: string | undefined,
  heure: string | undefined,
  conf: ConfirmationEvenement | null,
  todayISO: string,
): DateReunionMail | undefined {
  const jour = dateISO?.slice(0, 10);
  if (!jour || jour < todayISO) return undefined; // pas de date, ou deja passee
  const salleLibelle = ressourceParEmail(conf?.salleEmail)?.nom;
  return {
    dateISO: jour,
    ...(heure ? { heure } : {}),
    ...(conf?.modeReunion ? { mode: conf.modeReunion } : {}),
    ...(salleLibelle ? { salleLibelle } : {}),
  };
}

// --- 1. Preparation du brouillon (pre-remplissage) ---------------------------

export async function preparerMailReunionAction(coproCode: string): Promise<PreparerResult> {
  if (!zCode.safeParse(coproCode).success) return { ok: false, message: "Données invalides." };
  const garder = await garde(coproCode);
  if (!garder.ok) return garder;
  const g = garder.g;

  // Donnees de reunion RELUES cote serveur (jamais prises du client).
  const copro = await getCoproRepository().findByCode(coproCode, g.id);
  if (!copro) return { ok: false, message: "Copropriété introuvable." };

  // Aujourd'hui (UTC, cohérent avec formatDateLongue) : sert au filtre "date a venir"
  // et au calcul de la date de confirmation J+7.
  const todayISO = new Date().toISOString().slice(0, 10);

  const confirmations = await getConfirmations(coproCode);
  const confCs = confirmations.find((c) => c.type === "CS") ?? null;
  const confAg = confirmations.find((c) => c.type === "AG") ?? null;

  const cs = dateAProposer(copro.prochaineCsDate, copro.prochaineCsHeure, confCs, todayISO);
  const ag = dateAProposer(copro.prochaineAg?.date, copro.prochaineAg?.heure, confAg, todayISO);
  if (!cs && !ag) return { ok: false, message: "Aucune date à venir pour proposer une réunion." };

  const infos: InfosMailDatesReunion = {
    coproCode: copro.code,
    coproNom: copro.nom,
    coproAdresse: [copro.adresse.ligne1, copro.adresse.ville].filter(Boolean).join(" "),
    ...(cs ? { cs } : {}),
    ...(ag ? { ag } : {}),
    dateConfirmationISO: dateConfirmationJ7(todayISO),
  };

  const { source, emails } = await destinatairesConseilSyndical(coproCode);
  return {
    ok: true,
    source,
    emails,
    sujet: objetMailDatesReunion(infos),
    corps: corpsMailDatesReunion(infos),
  };
}

// --- 2. Envoi reel (irreversible, apres relecture + confirmation) ------------

export async function envoyerMailReunionAction(
  coproCode: string,
  a: string[],
  cc: string[],
  sujet: string,
  corps: string,
): Promise<EnvoiResult> {
  const v = z
    .object({ coproCode: zCode, a: zEmails, cc: zEmails, sujet: zSujet, corps: zCorps })
    .safeParse({ coproCode, a, cc, sujet, corps });
  if (!v.success) return { ok: false, message: "Données invalides." };
  const garder = await garde(coproCode);
  if (!garder.ok) return garder;
  const g = garder.g;

  // Destinataires : adresses bien formees, au moins une en "A", plafond global (anti-spam).
  const tous = [...a, ...cc].map((x) => x.trim()).filter(Boolean);
  if (a.filter((x) => EMAIL_RE.test(x.trim())).length === 0) {
    return { ok: false, message: "Ajoutez au moins un destinataire valide en « À »." };
  }
  const invalide = tous.find((x) => !EMAIL_RE.test(x));
  if (invalide) return { ok: false, message: `Adresse invalide : ${invalide}` };
  if (tous.length > 50) return { ok: false, message: "Trop de destinataires (50 maximum)." };

  try {
    // Signature Signitic recuperee cote serveur et injectee (un envoi app-only ne passe
    // pas par l'add-in Outlook). getGestionnaireCourant a deja resolu la session.
    const gestionnaire = await getGestionnaireCourant();
    const signatureHtml = gestionnaire ? ((await getSignatureGestionnaire(gestionnaire)) ?? undefined) : undefined;
    await envoyerMailReunion({ boite: g.email, a, cc, cci: [], sujet: sujet.trim(), corps, signatureHtml });
    return { ok: true };
  } catch (e) {
    // L'Application Access Policy Exchange peut refuser la boite (403) -> message clair,
    // jamais de crash. Le message Graph est deja tronque et sans PII cote adapter.
    return { ok: false, message: (e as Error).message || "Envoi impossible." };
  }
}
