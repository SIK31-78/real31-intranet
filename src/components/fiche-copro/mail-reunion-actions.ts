"use server";

// Server actions du mail au conseil syndical (increment 2 "dates CS/AG"). Deux temps,
// separes par une RELECTURE humaine (jamais d'envoi automatique) :
//   1. preparerMailReunionAction : compose un brouillon (destinataires + objet + corps)
//      a partir des donnees SERVEUR (copro, date, salle, statut) -> le gestionnaire relit.
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
import { statutPourDate } from "@/lib/domain/confirmation-evenement";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import {
  corpsMailReunion,
  objetMailReunion,
  type InfosMailReunion,
  type TypeReunion,
} from "@/lib/domain/mail-reunion";
import {
  destinatairesConseilSyndical,
  type SourceDestinataires,
} from "@/lib/services/coproprietes/destinataires-conseil";
import { getSignatureGestionnaire } from "@/lib/services/mes-emails/get-signature";
import { envoyerMailReunion } from "@/lib/services/coproprietes/envoyer-mail-reunion";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const zCode = z.string().trim().min(1).max(40);
const zType = z.enum(["AG", "CS"]);
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

// --- 1. Preparation du brouillon (pre-remplissage) ---------------------------

export async function preparerMailReunionAction(
  coproCode: string,
  type: TypeReunion,
): Promise<PreparerResult> {
  if (!z.object({ coproCode: zCode, type: zType }).safeParse({ coproCode, type }).success) {
    return { ok: false, message: "Données invalides." };
  }
  const garder = await garde(coproCode);
  if (!garder.ok) return garder;
  const g = garder.g;

  // Donnees de reunion RELUES cote serveur (jamais prises du client).
  const copro = await getCoproRepository().findByCode(coproCode, g.id);
  if (!copro) return { ok: false, message: "Copropriété introuvable." };
  const dateISO = type === "CS" ? copro.prochaineCsDate : copro.prochaineAg?.date;
  if (!dateISO) return { ok: false, message: "Aucune date à venir pour cette réunion." };
  const heure = type === "CS" ? copro.prochaineCsHeure : copro.prochaineAg?.heure;

  // Statut de confirmation + salle reservee (portes par la confirmation de la copro).
  const confirmations = await getConfirmations(coproCode);
  const conf = confirmations.find((c) => c.type === type) ?? null;
  const confirme = statutPourDate(conf, dateISO) === "confirme";
  const salleLibelle = ressourceParEmail(conf?.salleEmail)?.nom;

  const infos: InfosMailReunion = {
    type,
    coproCode: copro.code,
    coproNom: copro.nom,
    dateISO,
    ...(heure ? { heure } : {}),
    ...(salleLibelle ? { salleLibelle } : {}),
    confirme,
  };

  const { source, emails } = await destinatairesConseilSyndical(coproCode);
  return {
    ok: true,
    source,
    emails,
    sujet: objetMailReunion(infos),
    corps: corpsMailReunion(infos),
  };
}

// --- 2. Envoi reel (irreversible, apres relecture + confirmation) ------------

export async function envoyerMailReunionAction(
  coproCode: string,
  type: TypeReunion,
  a: string[],
  cc: string[],
  sujet: string,
  corps: string,
): Promise<EnvoiResult> {
  const v = z
    .object({ coproCode: zCode, type: zType, a: zEmails, cc: zEmails, sujet: zSujet, corps: zCorps })
    .safeParse({ coproCode, type, a, cc, sujet, corps });
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
