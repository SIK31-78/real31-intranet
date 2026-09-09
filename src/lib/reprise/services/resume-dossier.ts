// RESUME d'un dossier de reprise pour le tableau d'equipe (ADR-037) : une ligne par dossier,
// avec l'etape courante, les compteurs de blocage / retard et la derniere activite.
// Pur (aucune I/O, aucune horloge) : la date du jour est fournie par l'appelant.

import type { Dossier, EquipeReprise, Etape, Personne, Phase, StatutEtape } from "@/lib/reprise/domain/dossier";
import { avancement, estArchive, etapeCourante } from "@/lib/reprise/domain/dossier";

export interface DossierResume {
  ref: string;
  nomUsuel: string;
  adresse?: string;
  sortant?: string;
  dateBascule?: string;
  archive: boolean;
  /** 0..1 = part des etapes faites/ignorees. */
  avancement: number;
  etapesFaites: number;
  etapesTotal: number;
  /** Phase de l'etape courante ; undefined = reprise terminee. */
  phase?: Phase;
  etapeCourante?: {
    code: string;
    libelle: string;
    statut: StatutEtape;
    assigne?: Personne;
    note?: string;
    echeance?: string;
  };
  /** Etapes en statut bloque. */
  nbBloquees: number;
  /** Echeance < aujourd'hui et statut ni fait ni ignore. */
  nbEnRetard: number;
  /** max(journal.date, etapes.majLe) ; undefined si aucune trace. */
  derniereActivite?: string;
  equipe?: EquipeReprise;
}

function estClose(e: Etape): boolean {
  return e.statut === "fait" || e.statut === "ignore";
}

export function resumerDossier(d: Dossier, aujourdHuiIso: string): DossierResume {
  const aujourdHui = aujourdHuiIso.slice(0, 10);
  const courante = etapeCourante(d.etapes);
  const dates = [
    ...d.journal.map((j) => j.date),
    ...d.etapes.map((e) => e.majLe).filter((x): x is string => !!x),
  ];
  const derniereActivite = dates.length > 0 ? dates.reduce((m, x) => (x > m ? x : m)) : undefined;

  return {
    ref: d.ref,
    nomUsuel: d.nomUsuel,
    ...(d.adresse ? { adresse: d.adresse } : {}),
    ...(d.sortant ? { sortant: d.sortant } : {}),
    ...(d.dateBascule ? { dateBascule: d.dateBascule } : {}),
    archive: estArchive(d),
    avancement: avancement(d),
    etapesFaites: d.etapes.filter(estClose).length,
    etapesTotal: d.etapes.length,
    ...(courante ? { phase: courante.phase } : {}),
    ...(courante
      ? {
          etapeCourante: {
            code: courante.code,
            libelle: courante.libelle,
            statut: courante.statut,
            ...(courante.assigneA ? { assigne: courante.assigneA } : {}),
            ...(courante.note ? { note: courante.note } : {}),
            ...(courante.echeance ? { echeance: courante.echeance } : {}),
          },
        }
      : {}),
    nbBloquees: d.etapes.filter((e) => e.statut === "bloque").length,
    nbEnRetard: d.etapes.filter((e) => !estClose(e) && !!e.echeance && e.echeance < aujourdHui).length,
    ...(derniereActivite ? { derniereActivite } : {}),
    ...(d.equipe ? { equipe: d.equipe } : {}),
  };
}

/** Etapes assignees a une personne et encore ouvertes (ni faites ni ignorees), dans l'ordre du dossier. */
export function etapesAssigneesA(d: Dossier, personneId: string): Etape[] {
  return d.etapes.filter((e) => e.assigneA?.id === personneId && !estClose(e));
}
