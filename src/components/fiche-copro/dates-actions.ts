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
import { ressourceParEmail } from "@/lib/domain/salles-reunion";

const zCode = z.string().trim().min(1).max(40);
const zDate = z.string().trim().max(40); // ISO ou vide (= effacer la date)
const zTypeEvenement = z.enum(["AG", "CS"]);
const zEmail = z.string().trim().max(120); // valide ENSUITE contre la liste fermee
const zHeure = z.string().trim().regex(/^\d{2}:\d{2}$/); // "HH:mm"

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
): Promise<ResultatAction> {
  if (!z.object({ coproCode: zCode, dateISO: zDate }).safeParse({ coproCode, dateISO }).success)
    return { ok: false, erreur: "Données invalides." };
  // Ressources validees contre la liste fermee (salle = type salle, ZOE = type vehicule).
  const salle = validerRessource(salleEmail, "salle");
  const vehicule = validerRessource(vehiculeEmail, "vehicule");
  if (salle === "invalide" || vehicule === "invalide")
    return { ok: false, erreur: "Ressource de réunion invalide." };
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, erreur: "Session expirée, reconnectez-vous." };
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { ok: false, erreur: "Copropriété hors de votre périmètre." };
  try {
    // La boite de projection Outlook = email de SESSION (jamais un parametre client),
    // comme le RDV sinistre : le gestionnaire n'ecrit que dans son propre agenda.
    await definirDateEvenement(coproCode, type, quand, dateISO || null, g.id, g.email, {
      salleEmail: salle,
      vehiculeEmail: vehicule,
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
): Promise<ResultatAction> {
  return definir(coproCode, "ag", quand, dateISO, salleEmail, vehiculeEmail);
}
export async function definirDateCs(
  coproCode: string,
  dateISO: string,
  quand: "prochaine" | "derniere" = "prochaine",
  salleEmail?: string,
  vehiculeEmail?: string,
): Promise<ResultatAction> {
  return definir(coproCode, "cs", quand, dateISO, salleEmail, vehiculeEmail);
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
  const salle = validerRessource(salleEmail, "salle");
  if (salle === "invalide" || salle === null) return { dispo: "inconnu" };
  const g = await getGestionnaireCourant();
  if (!g?.email) return { dispo: "inconnu" }; // sans agenda cible, pas d'interrogation possible
  if (process.env.COPRO_SOURCE === "supabase" && !(await coproAppartient(coproCode, g.id)))
    return { dispo: "inconnu" };
  // Boite interrogeante = email de session (le gestionnaire interroge depuis son agenda).
  const dispo = await verifierDispoSalle(coproCode, type, dateISO, heure, salle, g.email);
  return { dispo };
}
