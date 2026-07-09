// Service de MAPPING de la reprise comptable - INCREMENT 2 : resoudre chaque compte source
// distinct du grand livre extrait vers sa cible eStale, sous forme d'un PLAN (DRY-RUN STRICT).
//
// AUCUNE ecriture, AUCUNE mutation eStale : le service LIT le referentiel comptable de la copro
// cible (comptes existants avec leur nom) puis delegue la decision au domaine pur mapping-compta.
// Les creations (fournisseur, sous-compte d'attente) figurent dans le plan comme ACTIONS A FAIRE,
// executees seulement a l'increment 3.
//
// Hexagonal : parle UNIQUEMENT au port EstaleComptaLectureProvider (lecture seule). La liste des
// comptes existants (lireComptes) porte deja nomenclature + libelle -> elle fournit a la fois les
// fournisseurs (401), les coproprietaires (450, crees a l'injection patrimoine) et l'existence des
// comptes d'attente 471998/471999. Aucun nouveau port n'est necessaire (choix DRY, cf. rapport).
//
// PII : les intitules (noms) servent a l'appariement mais ne sont JAMAIS logues ni renvoyes dans
// les messages du plan (seuls numeros de compte, scores et compteurs le sont).

import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import type { SoldeCompte } from "@/lib/reprise/domain/compta";
import {
  construirePlan,
  mapperCompte,
  racineCompte,
  type ContexteEstale,
  type PlanMapping,
} from "@/lib/reprise/domain/mapping-compta";
import type {
  EstaleComptaLectureProvider,
  RefAccounting,
} from "@/lib/reprise/ports/estale-compta-lecture-provider";
import { getEstaleComptaLectureProvider } from "@/lib/reprise/adapters/router";

export type ResultatPlanMapping =
  | { ok: true; plan: PlanMapping; ref: RefAccounting }
  | { ok: false; message: string };

/** Comptes source distincts du jeu extrait, avec leur intitule (si capture). */
function comptesSourceDistincts(jeu: JeuEcritures): { compte: string; intitule?: string }[] {
  const vus = new Map<string, string | undefined>();
  for (const l of jeu.lignes) {
    if (!vus.has(l.compte)) vus.set(l.compte, jeu.intitules?.[l.compte]);
  }
  return [...vus.entries()].map(([compte, intitule]) => ({ compte, intitule }));
}

/** Construit le referentiel eStale (fournisseurs 401, coproprietaires 450, comptes d'attente). */
export function construireContexteEstale(comptes: SoldeCompte[]): ContexteEstale {
  const enCandidat = (c: SoldeCompte) => ({ nomenclature: c.nomenclature, intitule: c.libelle ?? "" });
  const fournisseurs = comptes
    .filter((c) => racineCompte(c.nomenclature).startsWith("401"))
    .map(enCandidat);
  const coproprietaires = comptes
    .filter((c) => racineCompte(c.nomenclature).startsWith("450"))
    .map(enCandidat);
  const c471999 = comptes.find((c) => racineCompte(c.nomenclature).startsWith("471999"));
  const c471998 = comptes.find((c) => racineCompte(c.nomenclature).startsWith("471998"));
  return {
    fournisseurs,
    coproprietaires,
    nomenclature471999: c471999?.nomenclature,
    nomenclature471998: c471998?.nomenclature,
  };
}

/**
 * Construit le PLAN de mapping du jeu d'ecritures extrait vers la copro cible eStale (coproCode).
 * Generique par coproCode (aucun code copro en dur). Degrade proprement : copro introuvable ou
 * eStale indisponible => { ok:false, message } (jamais d'exception qui remonte).
 *
 * `provider` injectable pour les tests ; par defaut le routeur choisit reel (si eStale configure)
 * ou mock.
 */
export async function construirePlanMapping(
  jeu: JeuEcritures,
  coproCode: string,
  provider: EstaleComptaLectureProvider = getEstaleComptaLectureProvider(),
): Promise<ResultatPlanMapping> {
  try {
    const ref = await provider.resoudreAccounting(coproCode);
    if (!ref) {
      return {
        ok: false,
        message: `Copro "${coproCode}" introuvable dans eStale ou sans exercice comptable ouvert.`,
      };
    }

    const comptes = await provider.lireComptes(ref);
    const contexte = construireContexteEstale(comptes);

    const entrees = comptesSourceDistincts(jeu).map(({ compte, intitule }) =>
      mapperCompte(compte, intitule, contexte),
    );
    const plan = construirePlan(entrees);

    return { ok: true, plan, ref };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message: `Mapping eStale impossible pour "${coproCode}" : ${message}` };
  }
}
