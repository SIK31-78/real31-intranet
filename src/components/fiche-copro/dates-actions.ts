"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { definirDateEvenement } from "@/lib/services/coproprietes/definir-date-evenement";
import { confirmerEvenement } from "@/lib/services/coproprietes/confirmation-evenement";
import { verifierDispoSalle } from "@/lib/services/coproprietes/verifier-dispo-salle";
import { reporterSupervisionSansDate } from "@/lib/services/supervision-ag/reporter-sans-date";
import { reporterOdjSansDate } from "@/lib/services/odj/saisir-champ-odj";
import { coproAppartient } from "@/lib/services/coproprietes/copro-appartient";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getGestionnaireRepository } from "@/lib/adapters/router";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import { validerCollaborateursConnus } from "@/lib/domain/collaborateurs-reunion";

const zCode = z.string().trim().min(1).max(40);
const zDate = z.string().trim().max(40); // ISO ou vide (= effacer la date)
const zTypeEvenement = z.enum(["AG", "CS"]);
const zEmail = z.string().trim().max(120); // valide ENSUITE contre la liste fermee
const zHeure = z.string().trim().regex(/^\d{2}:\d{2}$/); // "HH:mm"
// Mode de reunion : liste fermee, ou "" (= non precise). Valide cote domaine (ModeReunion).
const zMode = z.enum(["visio", "presentiel", "hybride", ""]);
// Collaborateurs associes : liste BORNEE d'emails (forme seulement ici ; l'appartenance
// a la liste des gestionnaires connus est verifiee ensuite cote serveur, anti-injection).
const zCollaborateurs = z.array(z.string().trim().min(3).max(120)).max(20);

/**
 * Valide les emails de collaborateurs contre la liste FERMEE des gestionnaires du
 * cabinet (relue cote serveur, jamais de confiance au client). Renvoie les emails
 * CANONIQUES (casse de la liste), dedoublonnes, en excluant `selfEmail` (l'organisateur
 * ne s'invite pas). Un email hors liste -> "invalide" (anti-injection). [] -> [].
 */
async function validerCollaborateurs(
  emails: string[],
  selfEmail: string | undefined,
): Promise<string[] | "invalide"> {
  if (emails.length === 0) return [];
  const tous = await getGestionnaireRepository().list();
  const emailsConnus = tous.map((g) => g.email).filter((e): e is string => Boolean(e));
  // Anti-injection dans le domaine pur (teste offline) : ne garde que des emails connus.
  const r = validerCollaborateursConnus(emails, emailsConnus, selfEmail);
  return "invalide" in r ? "invalide" : r.emails;
}

/** Resultat explicite d'une action de date : succes, ou echec avec message a afficher. */
type ResultatAction = { ok: true } | { ok: false; erreur: string };

// Valide un email de salle / vehicule contre la liste FERMEE RESSOURCES_REAL31 : jamais
// d'email invente. Vide -> null (aucune ressource). Email hors liste, ou mauvais type
// (une salle la ou on attend un vehicule et inversement) -> "invalide".
function validerRessource(
  email: string | undefined,
  attendu: "salle" | "vehicule",
): string | null | "invalide" {
  const brut = (email ?? "").trim();
  if (!brut) return null;
  const r = ressourceParEmail(brut);
  if (!r || r.type !== attendu) return "invalide";
  return r.email; // email canonique de la liste (casse normalisee)
}

// Modifie une date d'AG / CS (ecrit dans public.Copropriete, partage App A).
// `quand` = prochaine (planifiee) ou derniere (tenue, correction du referentiel App A).
// Cloisonne : garde coproAppartient au niveau action (le scope managerId de l'adapter
// ne protege que l'UPDATE principal ; les follow-ups reporter* tournent sinon hors scope).
// Renvoie TOUJOURS un resultat explicite : plus aucun echec silencieux (l'UI affiche
// l'erreur au lieu de ne rien montrer, cf. bug remonte par les gestionnaires).
async function definir(
  coproCode: string,
  type: "ag" | "cs",
  quand: "prochaine" | "derniere",
  dateISO: string,
  salleEmail?: string,
  vehiculeEmail?: string,
  modeReunion?: string,
  collaborateursEmails?: string[],
): Promise<ResultatAction> {
  const parseBase = z
    .object({ coproCode: zCode, dateISO: zDate, mode: zMode, collaborateurs: zCollaborateurs })
    .safeParse({ coproCode, dateISO, mode: modeReunion ?? "", collaborateurs: collaborateursEmails ?? [] });
  if (!parseBase.success) return { ok: false, erreur: "Données invalides." };
  // Ressources validees contre la liste fermee (salle = type salle, ZOE = type vehicule).
  const salle = validerRessource(salleEmail, "salle");
  const vehicule = validerRessource(vehiculeEmail, "vehicule");
  if (salle === "invalide" || vehicule === "invalide")
    return { ok: false, erreur: "Ressource de réunion invalide." };
  // "" (non precise) -> null ; sinon le mode valide (zMode a deja borne les valeurs).
  const mode = parseBase.data.mode === "" ? null : parseBase.data.mode;
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée, reconnectez-vous." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  // Collaborateurs relus contre la liste des gestionnaires connus (jamais le client).
  const collaborateurs = await validerCollaborateurs(parseBase.data.collaborateurs, g.email);
  if (collaborateurs === "invalide")
    return { ok: false, erreur: "Collaborateur inconnu." };
  try {
    // La boite de projection Outlook = email de SESSION (jamais un parametre client),
    // comme le RDV sinistre : le gestionnaire n'ecrit que dans son propre agenda.
    await definirDateEvenement(coproCode, type, quand, dateISO || null, g.id, g.email, {
      salleEmail: salle,
      vehiculeEmail: vehicule,
      modeReunion: mode,
      collaborateursEmails: collaborateurs,
    });
    // (Re)fixer la PROCHAINE date d'AG reporte les prepas "sans date" (supervision + ODJ).
    // Corriger la derniere AG tenue est une mise a jour du referentiel : pas de report.
    if (type === "ag" && quand === "prochaine" && dateISO) {
      await reporterSupervisionSansDate(coproCode, dateISO, g.id);
      await reporterOdjSansDate(coproCode, dateISO, g.id);
    }
    // Changer une date recalcule les jalons : revalider TOUTES les vues qui les affichent
    // (sinon le calendrier / dashboard / Actions restent sur l'ancien calcul).
    revalidatePath(`/copropriete/${coproCode}`);
    revalidatePath("/calendrier");
    revalidatePath("/dashboard");
    revalidatePath("/mes-evenements");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message || "Enregistrement impossible." };
  }
}

export async function definirDateAg(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
  salleEmail?: string,
  vehiculeEmail?: string,
  modeReunion?: string,
  collaborateursEmails?: string[],
): Promise<ResultatAction> {
  return definir(coproCode, "ag", quand, dateISO, salleEmail, vehiculeEmail, modeReunion, collaborateursEmails);
}
export async function definirDateCs(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
  salleEmail?: string,
  vehiculeEmail?: string,
  modeReunion?: string,
  collaborateursEmails?: string[],
): Promise<ResultatAction> {
  return definir(coproCode, "cs", quand, dateISO, salleEmail, vehiculeEmail, modeReunion, collaborateursEmails);
}

// Confirme la prochaine date AG/CS : le conseil syndical a valide par retour de mail.
// La date confirmee est RELUE cote serveur dans le referentiel (jamais prise du client).
// Cloisonne : coproAppartient avant toute ecriture (anti-IDOR).
export async function confirmerEvenementAction(
  coproCode: string,
  type: "AG" | "CS",
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  if (!z.object({ coproCode: zCode, type: zTypeEvenement }).safeParse({ coproCode, type }).success)
    return { ok: false, erreur: "Données invalides." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    // Boite de projection Outlook = email de session (cf. definir ci-dessus).
    const date = await confirmerEvenement(coproCode, type, g.initiales, g.id, g.email);
    if (!date) return { ok: false, erreur: "Aucune date à confirmer." };
    revalidatePath(`/copropriete/${coproCode}`);
    revalidatePath("/calendrier");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: (e as Error).message };
  }
}

// Verifie la disponibilite d'une salle au creneau saisi (date + heure -> +2h), pour
// l'indicateur "Salle libre / occupee / dispo inconnue" de l'editeur de date. Lecture
// seule (pas d'ecriture) : auth + zod + coproAppartient conserves (anti-IDOR), salle
// validee contre la liste fermee. Degrade "inconnu" (Graph indisponible / 403).
export async function verifierDispoSalleAction(
  coproCode: string,
  type: "AG" | "CS",
  dateISO: string,
  heure: string,
  salleEmail: string,
): Promise<{ dispo: "libre" | "occupee" | "inconnu" }> {
  const parse = z
    .object({ coproCode: zCode, type: zTypeEvenement, dateISO: zDate, heure: zHeure, salleEmail: zEmail })
    .safeParse({ coproCode, type, dateISO, heure, salleEmail });
  if (!parse.success) return { dispo: "inconnu" };
  // Salle OU vehicule (la ZOE) : getSchedule marche sur toute boite ressource. On valide
  // juste que l'email est dans la liste fermee RESSOURCES_REAL31 (n'importe quel type).
  const ressource = ressourceParEmail(salleEmail.trim());
  if (!ressource) return { dispo: "inconnu" };
  const g = await getGestionnaireCourant();
  if (!g?.email) return { dispo: "inconnu" }; // sans agenda cible, pas d'interrogation possible
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { dispo: "inconnu" };
  // Boite interrogeante = email de session (le gestionnaire interroge depuis son agenda).
  const dispo = await verifierDispoSalle(coproCode, type, dateISO, heure, ressource.email, g.email);
  return { dispo };
}

// Verifie la disponibilite d'un AGENDA (le gestionnaire lui-meme, ou un collegue associe)
// au creneau saisi, pour l'indicateur "Ton agenda / <collegue> : libre / occupe / inconnu".
// Meme mecanique que la salle (getSchedule depuis la boite de session) mais la cible est
// une boite de gestionnaire, pas une ressource : on valide l'email contre SOI-MEME ou la
// liste FERMEE des gestionnaires connus (jamais un email arbitraire du client). Lecture
// seule, degrade "inconnu" (Graph indisponible / 403 Access Policy sur la boite collegue).
export async function verifierDispoAgendaAction(
  coproCode: string,
  type: "AG" | "CS",
  dateISO: string,
  heure: string,
  email?: string,
): Promise<{ dispo: "libre" | "occupee" | "inconnu" }> {
  const parse = z
    .object({ coproCode: zCode, type: zTypeEvenement, dateISO: zDate, heure: zHeure, email: zEmail })
    .safeParse({ coproCode, type, dateISO, heure, email: email ?? "" });
  if (!parse.success) return { dispo: "inconnu" };
  const g = await getGestionnaireCourant();
  if (!g?.email) return { dispo: "inconnu" }; // sans agenda interrogeant, pas d'interrogation
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { dispo: "inconnu" };
  // Cible autorisee : email vide -> SOI-MEME (ton agenda) ; sinon un gestionnaire connu
  // (liste fermee, anti-injection). Jamais une boite arbitraire venue du client.
  const cible = (email ?? "").trim().toLowerCase();
  let cibleCanonique: string | null;
  if (!cible || cible === g.email.toLowerCase()) {
    cibleCanonique = g.email; // ton propre agenda
  } else {
    const tous = await getGestionnaireRepository().list();
    cibleCanonique =
      tous
        .map((x) => x.email)
        .filter((e): e is string => Boolean(e))
        .find((e) => e.toLowerCase() === cible) ?? null;
  }
  if (!cibleCanonique) return { dispo: "inconnu" }; // email hors liste -> pas d'interrogation
  // Boite interrogeante = email de session ; on lit le free/busy de la cible via getSchedule.
  const dispo = await verifierDispoSalle(coproCode, type, dateISO, heure, cibleCanonique, g.email);
  return { dispo };
}

// Liste les collegues (gestionnaires du cabinet AVEC email) associables a une reunion,
// SOI-MEME exclu (l'organisateur n'est pas un invite). Sert au selecteur "Collaborateurs
// associes" de l'editeur de date. Auth requise (pas de fuite d'annuaire aux anonymes).
export async function listerCollaborateursAction(): Promise<{ email: string; nom: string }[]> {
  const g = await getGestionnaireCourant();
  if (!g) return [];
  const tous = await getGestionnaireRepository().list();
  return tous
    .filter((x) => x.email && x.id !== g.id)
    .map((x) => ({ email: x.email as string, nom: x.nomComplet }));
}
