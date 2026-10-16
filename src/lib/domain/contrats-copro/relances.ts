// Les rappels par mail des échéances de contrats (étape 5 du plan, décision 8 : le mail ne
// part qu'après nettoyage des échéances aberrantes, sujet par sujet, avec le feu vert de Sekou).
// Fonctions pures : qui est dû, sous quelle clé, avec quel texte. L'envoi, l'idempotence
// (intranet_rappels_envoyes) et les destinataires sont l'affaire du service.
//
// Cadence : un rappel par PÉRIODE de `cadenceJours` depuis l'ouverture de la fenêtre. La clé
// `contrats|<sujet>|<cycle>|<numéro de période>` est ce que la table des rappels envoyés
// dédoublonne : un cron qui repasse dans la même période ne renvoie rien. Le rouge met la
// direction en copie, comme le cron historique.

import { formatJourFR, joursEntre } from "./dates";
import { debutFenetre, joursSansAvancement, progression } from "./qualification";
import { LIBELLE_SUJET, LIBELLE_SUJET_LONG, type Cycle, type Niveau, type NiveauQualifie, type RegleRelance, type SujetSuivi } from "./types";

export interface EntreeRappel {
  cycle: Cycle;
  coproNom: string;
  niveau: NiveauQualifie;
  regle: RegleRelance;
}

export interface RappelDu {
  /** Clé d'idempotence : contrats|<sujet>|<cycleId>|<période>. */
  cle: string;
  cycleId: string;
  sujet: SujetSuivi;
  coproCode: string;
  coproNom: string;
  echeanceISO: string;
  niveau: Niveau;
  /** Rouge : la direction est en copie. */
  copieDirection: boolean;
  /** Jours sans étape franchie depuis l'ouverture de la fenêtre (ce que le niveau mesure). */
  joursSansAvancement: number;
  /** La dernière étape datée, pour situer le dossier dans le mail ; null si aucune. */
  etapeCourante: { libelle: string; dateISO: string } | null;
}

export function cleRappel(sujet: SujetSuivi, cycleId: string, periode: number): string {
  return `contrats|${sujet}|${cycleId}|${periode}`;
}

/** Les rappels dus aujourd'hui : cycles en cours, datés, fenêtre ouverte ; jamais les « à compléter ». */
export function rappelsDus(entrees: readonly EntreeRappel[], aujourdhuiISO: string): RappelDu[] {
  const out: RappelDu[] = [];
  for (const { cycle, coproNom, niveau, regle } of entrees) {
    if (cycle.statut !== "en_cours" || !cycle.echeanceISO || niveau === "a_completer") continue;
    const debut = debutFenetre(cycle.echeanceISO, regle);
    if (debut > aujourdhuiISO) continue;
    const periode = Math.floor(joursEntre(debut, aujourdhuiISO) / Math.max(1, regle.cadenceJours));
    const prog = progression(cycle.sujet, cycle.etapes);
    const dateCourante = prog.etapeCourante ? cycle.etapes[prog.etapeCourante.cle] : undefined;
    out.push({
      cle: cleRappel(cycle.sujet, cycle.id, periode),
      cycleId: cycle.id,
      sujet: cycle.sujet,
      coproCode: cycle.coproCode,
      coproNom,
      echeanceISO: cycle.echeanceISO,
      niveau,
      copieDirection: niveau === "rouge",
      joursSansAvancement: joursSansAvancement(cycle, regle, aujourdhuiISO) ?? 0,
      etapeCourante: prog.etapeCourante && dateCourante ? { libelle: prog.etapeCourante.libelle, dateISO: dateCourante } : null,
    });
  }
  return out;
}

/** « [Échéance Assurance] NOM (S0247) : échéance 01/03/2027 » */
export function sujetMail(r: RappelDu): string {
  return `[Échéance ${LIBELLE_SUJET[r.sujet]}] ${r.coproNom} (${r.coproCode}) : échéance ${formatJourFR(r.echeanceISO)}`;
}

function phraseNiveau(r: RappelDu): string {
  const jours = `${r.joursSansAvancement} jour${r.joursSansAvancement > 1 ? "s" : ""}`;
  switch (r.niveau) {
    case "rouge":
      return `Niveau rouge : dossier sans avancement depuis ${jours}. La direction est en copie.`;
    case "orange":
      return `Niveau orange : dossier sans avancement depuis ${jours}.`;
    case "vert":
      return "Niveau vert : le dossier avance, ce message rappelle seulement l'échéance.";
  }
}

/** Corps en texte clair, français, prêt à partir. */
export function corpsMail(r: RappelDu, lienFiche: string): string {
  const lignes = [
    "Bonjour,",
    "",
    `${LIBELLE_SUJET_LONG[r.sujet]} de la copropriété ${r.coproNom} (${r.coproCode}) arrive à échéance le ${formatJourFR(r.echeanceISO)}.`,
    "",
    phraseNiveau(r),
    r.etapeCourante
      ? `Dernière étape datée : « ${r.etapeCourante.libelle} » le ${formatJourFR(r.etapeCourante.dateISO)}.`
      : "Aucune étape n'est encore datée sur ce cycle.",
    "",
    `Fiche de la copropriété : ${lienFiche}`,
    "",
    "Message automatique de l'intranet REAL31.",
  ];
  return lignes.join("\n");
}
