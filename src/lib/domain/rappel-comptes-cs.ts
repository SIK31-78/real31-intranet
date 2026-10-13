// Rappel aux comptables 10 jours avant la reunion du conseil syndical, UNIQUEMENT si les
// comptes ne sont pas encore verifies (REA-140, decision Sekou du 12/10/2026).
// Logique PURE : on recoit les copros (date du CS, date d'AG) et l'etat « comptes
// verifies » deja lus, on rend les rappels a envoyer. Aucun I/O ici.
//
// L'etat « comptes verifies » est le flag compta.comptes_verifies du pole compta (panneau
// de la fiche compta), cle par (copro, date de la PROCHAINE AG) : les comptes qu'on
// verifie pour le CS sont ceux qui partent a l'AG qui suit.

/** Fenetre du rappel : on previent a J-10, et on rattrape jusqu'a J-1 si le cron a manque
 *  un jour ou si la date du CS a ete posee moins de 10 jours avant. La trace d'envoi
 *  (cle copro + date du CS) empeche tout second envoi dans la fenetre. */
export const JOURS_AVANT_CS = 10;

export interface CoproPourRappelCs {
  coproCode: string;
  coproNom: string;
  /** Prochain CS ('YYYY-MM-DD' ou datetime) ; absent = pas de CS planifie. */
  csDate?: string | null;
  /** Prochaine AG ('YYYY-MM-DD') ; absente = les comptes ne peuvent pas encore etre marques verifies. */
  agDate?: string | null;
  comptesVerifies: boolean;
}

export interface RappelComptesCs {
  /** Cle d'idempotence : un rappel par copro et par date de CS. */
  cle: string;
  coproCode: string;
  coproNom: string;
  csDate: string;
  agDate: string | null;
  joursAvant: number;
}

/** Nombre de jours calendaires de `deISO` a `aISO` (jours seuls, pas d'heure). */
export function joursEntre(deISO: string, aISO: string): number {
  const d = Date.UTC(+deISO.slice(0, 4), +deISO.slice(5, 7) - 1, +deISO.slice(8, 10));
  const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10));
  return Math.round((a - d) / 86_400_000);
}

export function cleRappelComptesCs(coproCode: string, csDate: string): string {
  return `rappel-comptes-cs|${coproCode}|${csDate.slice(0, 10)}`;
}

/** Les rappels du jour : CS dans 1 a 10 jours, comptes non verifies. Trie par date de CS. */
export function selectionnerRappelsComptesCs(
  copros: readonly CoproPourRappelCs[],
  jourISO: string,
): RappelComptesCs[] {
  const rappels: RappelComptesCs[] = [];
  for (const c of copros) {
    if (!c.csDate || c.comptesVerifies) continue;
    const joursAvant = joursEntre(jourISO, c.csDate);
    if (joursAvant < 1 || joursAvant > JOURS_AVANT_CS) continue;
    rappels.push({
      cle: cleRappelComptesCs(c.coproCode, c.csDate),
      coproCode: c.coproCode,
      coproNom: c.coproNom,
      csDate: c.csDate.slice(0, 10),
      agDate: c.agDate ? c.agDate.slice(0, 10) : null,
      joursAvant,
    });
  }
  return rappels.sort((x, y) => x.csDate.localeCompare(y.csDate) || x.coproCode.localeCompare(y.coproCode));
}
