// Surveillance des synchros qui tournent HORS de l'intranet (REA-291). Aujourd'hui une
// seule : l'annuaire des expediteurs, relu chaque nuit depuis l'export Crypto par un
// script sur le PC de Sekou. Le script note chaque passage ; l'intranet juge ici si
// quelque chose cloche, pour alerter par mail et afficher un bandeau.
// Pur : aucune I/O.

export const CLE_ANNUAIRE_CRYPTO = "annuaire-crypto";

export interface EtatSynchro {
  /** Dernier passage du script, reussi ou non. */
  passeLe: string;
  reussiLe: string | null;
  /** Date de l'export relu au dernier succes. */
  exportDu: string | null;
  statut: "reussi" | "inchange" | "echec";
  message: string | null;
  lignes: number | null;
}

export interface DiagnosticSynchro {
  alerte: boolean;
  /** Phrases lisibles, une par probleme. */
  raisons: string[];
}

const HEURE = 3600 * 1000;
/** Le script tourne chaque nuit : 36 h sans passage = une nuit sautee. */
export const DELAI_PASSAGE_H = 36;
/** L'export du patron peut sauter un week-end ; au-dela de 4 jours, il s'est arrete. */
export const DELAI_EXPORT_H = 96;

const jour = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function diagnostiquerAnnuaire(etat: EtatSynchro | null, maintenant: Date): DiagnosticSynchro {
  if (!etat) {
    return { alerte: true, raisons: ["L'annuaire des expéditeurs Crypto n'a jamais été synchronisé."] };
  }
  const raisons: string[] = [];
  const age = (iso: string) => (maintenant.getTime() - new Date(iso).getTime()) / HEURE;

  if (etat.statut === "echec") {
    raisons.push(`La dernière synchro (${jour(etat.passeLe)}) a échoué : ${etat.message ?? "raison inconnue"}.`);
  }
  if (age(etat.passeLe) > DELAI_PASSAGE_H) {
    raisons.push(`Le script n'a pas tourné depuis le ${jour(etat.passeLe)} : le PC est peut-être éteint ou la tâche planifiée arrêtée.`);
  }
  if (etat.exportDu && age(etat.exportDu) > DELAI_EXPORT_H) {
    raisons.push(`L'export Crypto n'a pas été renouvelé depuis le ${jour(etat.exportDu)} : l'export du patron ou la synchro OneDrive est arrêté.`);
  }
  if (!etat.reussiLe) raisons.push("Aucune synchro n'a encore réussi.");
  return { alerte: raisons.length > 0, raisons };
}
