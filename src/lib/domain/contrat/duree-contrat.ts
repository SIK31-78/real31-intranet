// Duree d'un contrat de syndic, en annees / mois / jours.
// Portage de l'Office Script `ContratReplace` (placeholder [DureeContrat]) utilise
// par le flow `[REAL] Generation du contrat de syndic`. Fonction pure, deterministe.
//
// Regle metier reproduite a l'identique, y compris :
//   - le calcul par emprunt (borrow) jours -> mois -> annees ;
//   - la regle d'arrondi : 11 mois et >= 29 jours -> +1 an, 0 mois, 0 jour.
//     Un contrat cale du 01/07 au 30/06 (soit ~364 jours) s'affiche donc « 1 an »,
//     ce qui neutralise le decalage d'1 jour entre DebutContrat et FinContrat cote
//     flow. Cf. mythec-refactor/powerapps/office-scripts/ContratReplace.ts et
//     MIGRATION_PLAN.md #7.

export interface DureeContrat {
  annees: number;
  mois: number;
  jours: number;
}

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

/** Nombre de jours du mois (moisIndex0 : 0 = janvier ... 11 = decembre). */
function joursDansMois(annee: number, moisIndex0: number): number {
  const jours = [31, estBissextile(annee) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return jours[moisIndex0];
}

function parseISO(iso: string): { annee: number; moisIndex0: number; jour: number } {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return { annee, moisIndex0: mois - 1, jour };
}

/**
 * Calcule la duree d'un contrat entre deux dates ISO ("YYYY-MM-DD").
 * La source PowerApps recevait des dates "dd/MM/yyyy" ; la conversion se fait au
 * boundary, le domaine travaille en ISO (comme le reste de `lib/domain`).
 */
export function calculerDureeContrat(debutISO: string, finISO: string): DureeContrat {
  if (finISO < debutISO) {
    throw new Error("Duree contrat : la date de fin precede la date de debut.");
  }
  const debut = parseISO(debutISO);
  const fin = parseISO(finISO);

  let annees = fin.annee - debut.annee;
  let mois = fin.moisIndex0 - debut.moisIndex0;
  let jours = fin.jour - debut.jour;

  if (jours < 0) {
    mois -= 1;
    // Emprunt : jours du mois precedant le mois de fin (bascule sur decembre de
    // l'annee precedente si le mois de fin est janvier).
    const moisPrec = fin.moisIndex0 - 1;
    jours += moisPrec < 0 ? joursDansMois(fin.annee - 1, 11) : joursDansMois(fin.annee, moisPrec);
  }

  if (mois < 0) {
    annees -= 1;
    mois += 12;
  }

  // Arrondi metier : quasi une annee pleine -> une annee nette.
  if (mois === 11 && jours >= 29) {
    annees += 1;
    mois = 0;
    jours = 0;
  }

  return { annees, mois, jours };
}

/** Reproduit le libelle exact de l'Office Script : "X an(s), Y mois, Z jour(s)".
 *  Pluriel sur « an » et « jour » uniquement si > 1 ; « mois » invariable. */
export function formaterDureeContrat({ annees, mois, jours }: DureeContrat): string {
  return `${annees} an${annees > 1 ? "s" : ""}, ${mois} mois, ${jours} jour${jours > 1 ? "s" : ""}`;
}

/** Raccourci : duree formatee directement depuis les dates ISO. */
export function dureeContratTexte(debutISO: string, finISO: string): string {
  return formaterDureeContrat(calculerDureeContrat(debutISO, finISO));
}
