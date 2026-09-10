// UNE action principale par ecran - extension UI de `actionDuMoment` (domain/cycle-ag),
// sans toucher au domaine. Le domaine dit CE QU'IL FAUT FAIRE et OU ; ce helper dit
// QUEL bouton est le primaire SUR L'ECRAN OU L'ON EST :
//   - l'action du moment se joue AILLEURS -> c'est elle le primaire (on y va) ;
//   - elle se joue ICI -> le primaire devient la transition LOCALE de l'ecran
//     (cloturer l'ODJ, conclure l'AG), et l'action du moment n'est qu'une mention.
// Pur, teste. Les libelles metier ("Fixer", "ODJ", "Supervision", "Conclure") viennent
// du domaine ; les libelles LOCAUX ci-dessous sont ceux deja a l'ecran (cloture-odj,
// conclure-bouton), inchanges.

import type { ActionDuMoment, CycleAg } from "@/lib/domain/cycle-ag";

export type Ecran = "fiche" | "odj" | "supervision";

export interface ActionEcran {
  label: string;
  /** Navigation : le bouton est un lien. */
  href?: string;
  /** Transition locale a l'ecran (pas de navigation) : le composant concerne la rend. */
  locale?: "cloturer-odj" | "conclure-ag";
  /** Action secondaire eventuelle (ex. "Preparer l'ODJ" pendant la phase Dates). */
  secondaire?: { label: string; href: string };
}

const PREFIXE: Record<Ecran, string> = {
  fiche: "/copropriete/",
  odj: "/odj/",
  supervision: "/supervision-ag/",
};

/** L'action du moment se joue-t-elle sur cet ecran ? */
export function seJoueIci(action: ActionDuMoment | null | undefined, ecran: Ecran): boolean {
  return Boolean(action?.href.startsWith(PREFIXE[ecran]));
}

export function actionPrincipaleEcran(
  cycle: Pick<CycleAg, "actionDuMoment"> | null | undefined,
  ecran: Ecran,
  contexte: {
    coproCode: string;
    /** ODJ : le document est cloture (reunion terminee). */
    odjClos?: boolean;
    /** Id "CODE__YYYY-MM-DD" de la supervision de l'AG visee, absent sans date. */
    supervisionId?: string;
    /** Supervision : deja conclue (lecture seule) -> plus d'action. */
    supervisionConclue?: boolean;
  },
): ActionEcran | null {
  const action = cycle?.actionDuMoment ?? null;

  switch (ecran) {
    case "fiche": {
      // La fiche est le point de depart : l'action du moment est TOUJOURS son primaire
      // (y compris "Fixer", qui se joue sur la fiche elle-meme : ActionCycleFiche
      // transforme alors le lien circulaire en scroll + focus sur #dates-ag).
      if (!action) return null;
      return {
        label: action.label,
        href: action.href,
        ...(action.secondaire ? { secondaire: { label: action.secondaire.label, href: action.secondaire.href } } : {}),
      };
    }
    case "odj": {
      // Document ouvert : la sortie de l'ecran est la cloture (locale, avec sa case a
      // cocher). Document clos : on passe a la supervision - ou on va dater l'AG.
      if (!contexte.odjClos) return { label: "Marquer la réunion terminée", locale: "cloturer-odj" };
      if (contexte.supervisionId) {
        return { label: "Passer à la supervision AG", href: `/supervision-ag/${contexte.supervisionId}` };
      }
      return { label: "Fixer la date de l'AG", href: `/copropriete/${contexte.coproCode}` };
    }
    case "supervision": {
      if (contexte.supervisionConclue) return null;
      // L'action du moment renvoie ailleurs (ODJ, fiche) : on y va. Sinon (convoc, tenue,
      // PV, conclure, ou cycle sans action) le primaire de l'ecran reste "Conclure l'AG".
      if (action && !seJoueIci(action, "supervision")) {
        return { label: action.label, href: action.href };
      }
      return { label: "Conclure l'AG", locale: "conclure-ag" };
    }
  }
}
