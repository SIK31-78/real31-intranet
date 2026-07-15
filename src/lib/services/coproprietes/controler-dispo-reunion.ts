// Service : controle serveur des disponibilites avant de FIXER une date d'AG / CS
// (defense en profondeur, decision Sekou 2026-07 "OCCUPE = BLOQUANT"). Ne fait JAMAIS
// confiance au client : l'action re-verifie ici la salle, l'agenda du gestionnaire et
// les collegues invites au moment de valider, et REFUSE si une cible est "occupee".
//
// Regles :
//   - "occupee" -> blocage (message a afficher) ;
//   - "libre" / "inconnu" -> laisse passer ;
//   - erreur Graph (403 Access Policy, timeout...) -> "inconnu" -> laisse passer (jamais
//     bloquant : l'app doit rester utilisable en local et tant que le DSI n'a pas ouvert
//     les salles / boites) ;
//   - le PLAN (planifierControlesDispo, domaine pur) exclut deja les cibles dont un
//     "occupe" viendrait de notre propre evenement projete (cas replanification).
//
// Passe par verifierDispoSalle (routeur, ADR-001), comme l'indicateur temps reel de
// l'editeur : getSchedule sur la boite cible, vue depuis la boite du gestionnaire.

import type { PlanControlesDispo } from "@/lib/domain/disponibilite-reunion";
import { heureDe } from "@/lib/domain/reunion";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import { verifierDispoSalle } from "@/lib/services/coproprietes/verifier-dispo-salle";

/** Dispo d'une cible, en degradant toute erreur Graph en "inconnu" (jamais bloquant). */
async function dispoOuInconnu(
  coproCode: string,
  type: "AG" | "CS",
  dateJour: string,
  heure: string,
  cibleEmail: string,
  boite: string,
): Promise<"libre" | "occupee" | "inconnu"> {
  try {
    return await verifierDispoSalle(coproCode, type, dateJour, heure, cibleEmail, boite);
  } catch {
    return "inconnu"; // une panne Graph ne bloque jamais la pose de date
  }
}

/**
 * Controle les cibles du `plan` sur le creneau `debut` (datetime "YYYY-MM-DDTHH:mm[:ss]"),
 * depuis la `boite` du gestionnaire. Renvoie un message de refus si au moins une cible est
 * occupee, sinon null (on peut fixer la date). Sans heure exploitable -> null (on ne peut
 * pas cadrer un creneau, comme l'indicateur temps reel).
 */
export async function controlerDisposReunion(
  coproCode: string,
  type: "AG" | "CS",
  debut: string,
  boite: string,
  plan: PlanControlesDispo,
): Promise<string | null> {
  const dateJour = debut.slice(0, 10);
  const heure = heureDe(debut);
  if (!heure || !boite) return null; // pas de creneau cadrable / pas d'agenda interrogeant

  const blocages: string[] = [];

  // Agenda du gestionnaire (mon agenda) : getSchedule sur ma propre boite.
  if (plan.verifierAgenda) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, boite, boite);
    if (d === "occupee") blocages.push("ton agenda est occupé sur ce créneau");
  }

  // Salle reservee.
  if (plan.salleAverifier) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, plan.salleAverifier, boite);
    if (d === "occupee") {
      const nom = ressourceParEmail(plan.salleAverifier)?.nom ?? "sélectionnée";
      blocages.push(`la salle ${nom} est occupée sur ce créneau`);
    }
  }

  // Collegues invites (une seule mention "un collègue" suffit : on ne divulgue pas de PII
  // dans le message d'erreur ; le detail par personne est cote UI, qui connait les noms).
  for (const email of plan.collaborateursAverifier) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, email, boite);
    if (d === "occupee") {
      blocages.push("l'agenda d'un collègue associé est occupé sur ce créneau");
      break;
    }
  }

  if (blocages.length === 0) return null;
  const liste = blocages.join(" ; ");
  return `Impossible de fixer cette date : ${liste}. Change de créneau, de salle ou de collaborateur.`;
}
