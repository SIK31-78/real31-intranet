// Service : controle serveur des disponibilites avant de FIXER une date d'AG / CS
// (defense en profondeur). Ne fait JAMAIS confiance au client : l'action re-verifie ici
// la salle, l'agenda du gestionnaire et les collegues invites au moment de valider.
//
// DEUX niveaux (decision Sekou 2026-07-23) :
//   - SALLE occupee = blocage DUR : on ne peut pas double-reserver une salle -> refus ferme.
//   - MON agenda / un COLLEGUE occupe = avertissement FORCABLE : apres echange avec le
//     collegue, il faut quand meme pouvoir fixer -> l'action laisse passer si `forcer`.
//
// Regles de dispo (inchangees) :
//   - "libre" / "inconnu" -> pas de blocage ;
//   - erreur Graph (403 Access Policy, timeout...) -> "inconnu" -> laisse passer (jamais
//     bloquant : l'app reste utilisable en local et tant que le DSI n'a pas ouvert les
//     salles / boites) ;
//   - le PLAN (planifierControlesDispo, domaine pur) exclut deja les cibles dont un
//     "occupe" viendrait de notre propre evenement projete (cas replanification).
//
// Passe par verifierDispoSalle (routeur, ADR-001), comme l'indicateur temps reel de
// l'editeur : getSchedule sur la boite cible, vue depuis la boite du gestionnaire.

import type { PlanControlesDispo } from "@/lib/domain/disponibilite-reunion";
import { heureDe } from "@/lib/domain/reunion";
import { ressourceParEmail } from "@/lib/domain/salles-reunion";
import { verifierDispoSalle } from "@/lib/services/coproprietes/verifier-dispo-salle";

/** Resultat du controle : blocage DUR (salle) et/ou avertissement FORCABLE (agenda/collegue). */
export interface ControleDispo {
  /** Message si une SALLE est occupee (blocage dur, non forcable). null sinon. */
  salle: string | null;
  /** Message si mon agenda / un collegue est occupe (avertissement forcable). null sinon. */
  agenda: string | null;
}

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
 * depuis la `boite` du gestionnaire. Renvoie SEPAREMENT le blocage salle (dur) et
 * l'avertissement agenda/collegue (forcable). Sans heure exploitable -> rien (on ne peut
 * pas cadrer un creneau, comme l'indicateur temps reel).
 */
export async function controlerDisposReunion(
  coproCode: string,
  type: "AG" | "CS",
  debut: string,
  boite: string,
  plan: PlanControlesDispo,
): Promise<ControleDispo> {
  const dateJour = debut.slice(0, 10);
  const heure = heureDe(debut);
  if (!heure || !boite) return { salle: null, agenda: null }; // pas de creneau cadrable

  let salle: string | null = null;
  const avertissements: string[] = [];

  // Agenda du gestionnaire (mon agenda) : getSchedule sur ma propre boite. FORCABLE.
  if (plan.verifierAgenda) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, boite, boite);
    if (d === "occupee") avertissements.push("ton agenda est occupé sur ce créneau");
  }

  // Salle reservee : blocage DUR (on ne peut pas double-reserver une salle).
  if (plan.salleAverifier) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, plan.salleAverifier, boite);
    if (d === "occupee") {
      const nom = ressourceParEmail(plan.salleAverifier)?.nom ?? "sélectionnée";
      salle = `la salle ${nom} est occupée sur ce créneau`;
    }
  }

  // Collegues invites (une seule mention "un collègue" suffit : on ne divulgue pas de PII
  // dans le message ; le detail par personne est cote UI, qui connait les noms). FORCABLE.
  for (const email of plan.collaborateursAverifier) {
    const d = await dispoOuInconnu(coproCode, type, dateJour, heure, email, boite);
    if (d === "occupee") {
      avertissements.push("l'agenda d'un collègue associé est occupé sur ce créneau");
      break;
    }
  }

  return {
    salle: salle ? `Impossible de fixer cette date : ${salle}` : null,
    agenda: avertissements.length > 0 ? avertissements.join(" ; ") : null,
  };
}
