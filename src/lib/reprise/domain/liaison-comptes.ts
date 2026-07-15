// Domaine PUR de la LIAISON owners <-> comptes 450 de l'ancien syndic (aucune I/O).
//
// C'est l'insight central de l'onboarding UNIFIE (patrimoine + compta en meme temps) : au lieu
// d'apparier les comptes 450 du grand livre par NOM APRES l'injection (source d'erreurs sur les
// homonymes), on rapproche DES L'ANALYSE le nom de chaque owner (feuille de presence) avec
// l'intitule des comptes 450 du grand livre. Chaque owner recoit ainsi son numero de compte 450
// source -> une fois l'owner injecte, l'attribution de la compta devient DETERMINISTE (le numero
// de compte est la cle, plus besoin d'appariement par nom).
//
// On REUTILISE le scoring conservateur de mapping-compta (normaliserNom + scoreAppariement +
// memes seuils) : appariement fort ET non ambigu => "lie" ; sinon "ambigu" (candidats a trancher)
// ou "non_trouve". Un compte 450 membre d'un groupe homonyme cote grand livre ne peut JAMAIS
// etre lie automatiquement (ambigu par construction). Une collision (deux owners visant le meme
// compte) retrograde les deux en ambigu.
//
// PII : ce module lit des noms (owner + intitule 450) UNIQUEMENT pour le calcul de score ; il ne
// les recopie JAMAIS dans les warnings/notes (seuls ownerId, numeros de compte et scores y sont).

import type { LiaisonOwnerCompte, Owner, StatutLiaison } from "@/lib/reprise/domain/patrimoine";
import {
  classifierCompte,
  normaliserNom,
  scoreAppariement,
  MARGE_AMBIGUITE,
  SEUIL_APPARIEMENT_FORT,
  SEUIL_APPARIEMENT_MINI,
} from "@/lib/reprise/domain/mapping-compta";

/** Un compte 450 du grand livre avec son intitule (nom du coproprietaire imprime). */
export interface Compte450 {
  /** Numero de compte source (ex. "4501.100489139"). */
  compte: string;
  /** Intitule imprime (PII : sert au score, jamais recopie dans les messages). */
  intitule: string;
}

/** Resultat de la liaison : une liaison par owner + comptes non lies + warnings PII-free. */
export interface ResultatLiaison {
  /** Une entree par owner (statut lie / ambigu / non_trouve). */
  liaisons: LiaisonOwnerCompte[];
  /** Comptes 450 du grand livre rattaches a aucun owner "lie". PII-free (numeros). */
  comptesNonLies: string[];
  /** Points de vigilance PII-free (ambiguites, homonymes, collisions). */
  warnings: string[];
}

/** Nom complet d'un owner pour l'appariement (nom + prenom ; casse/accents geres par le score). */
export function nomOwner(o: Owner): string {
  return [o.nom, o.prenom].filter((s) => s && s.trim().length > 0).join(" ");
}

/** Ne garde que les comptes 450 (coproprietaires) d'une table d'intitules { compte -> nom }. */
export function comptes450DeIntitules(intitules: Record<string, string> | undefined): Compte450[] {
  const out: Compte450[] = [];
  for (const [compte, intitule] of Object.entries(intitules ?? {})) {
    if (!intitule || !intitule.trim()) continue;
    if (classifierCompte(compte) === "coproprietaire") out.push({ compte, intitule });
  }
  return out;
}

/** Groupes de comptes 450 partageant le MEME nom normalise (>= 2). Renvoie l'ensemble des membres. */
function comptesHomonymes(comptes: Compte450[]): Set<string> {
  const parNom = new Map<string, string[]>();
  for (const c of comptes) {
    const cle = normaliserNom(c.intitule);
    if (!cle) continue;
    const arr = parNom.get(cle) ?? [];
    arr.push(c.compte);
    parNom.set(cle, arr);
  }
  const membres = new Set<string>();
  for (const arr of parNom.values()) if (arr.length >= 2) for (const c of arr) membres.add(c);
  return membres;
}

/** Meilleur + second score d'un owner contre la liste des comptes 450. */
function apparier(nom: string, comptes: Compte450[]): { meilleur: number; second: number; compte?: string } {
  let meilleur = -1;
  let second = -1;
  let compte: string | undefined;
  for (const c of comptes) {
    const s = scoreAppariement(nom, c.intitule);
    if (s > meilleur) {
      second = meilleur;
      meilleur = s;
      compte = c.compte;
    } else if (s > second) {
      second = s;
    }
  }
  return { meilleur: meilleur < 0 ? 0 : meilleur, second: second < 0 ? 0 : second, compte };
}

/** Candidats >= SEUIL_MINI, tries par score decroissant (PII-free : numero + score). */
function candidatsDe(nom: string, comptes: Compte450[]): { compteSource: string; confiance: number }[] {
  return comptes
    .map((c) => ({ compteSource: c.compte, confiance: scoreAppariement(nom, c.intitule) }))
    .filter((c) => c.confiance >= SEUIL_APPARIEMENT_MINI)
    .sort((a, b) => b.confiance - a.confiance)
    .slice(0, 4);
}

/**
 * Lie chaque owner a son compte 450 de l'ancien syndic. Pur : meme entree => meme sortie.
 *
 * Regles (conservatrices, calquees sur mapping-compta) :
 *   - meilleur score >= SEUIL_APPARIEMENT_FORT, non ambigu (2e candidat < seuil mini ou marge
 *     suffisante), et le compte n'est PAS un homonyme cote grand livre -> "lie" ;
 *   - meilleur score >= SEUIL_APPARIEMENT_MINI mais faible/ambigu/homonyme -> "ambigu" (candidats) ;
 *   - sinon -> "non_trouve".
 *   - collision : si deux owners "lie" visent le MEME compte, les deux repassent en "ambigu".
 */
export function lierOwnersComptes(owners: Owner[], comptes450: Compte450[]): ResultatLiaison {
  const homonymes = comptesHomonymes(comptes450);
  const warnings: string[] = [];

  // Passe 1 : appariement par owner.
  const liaisons: LiaisonOwnerCompte[] = owners.map((o) => {
    const nom = nomOwner(o);
    if (!nom || comptes450.length === 0) {
      return { ownerId: o.id, statut: "non_trouve" as StatutLiaison, confiance: 0 };
    }
    const { meilleur, second, compte } = apparier(nom, comptes450);
    const ambiguScore = second >= SEUIL_APPARIEMENT_MINI && meilleur - second < MARGE_AMBIGUITE;
    const estHomonyme = compte !== undefined && homonymes.has(compte);

    if (compte && meilleur >= SEUIL_APPARIEMENT_FORT && !ambiguScore && !estHomonyme) {
      return { ownerId: o.id, statut: "lie", compteSource: compte, confiance: meilleur };
    }
    if (compte && meilleur >= SEUIL_APPARIEMENT_MINI) {
      warnings.push(
        `owner ${o.id} : appariement 450 ${estHomonyme ? "homonyme" : ambiguScore ? "ambigu" : "faible"} (confiance ${meilleur.toFixed(2)}) -> a trancher`,
      );
      return {
        ownerId: o.id,
        statut: "ambigu",
        confiance: meilleur,
        candidats: candidatsDe(nom, comptes450),
        ...(estHomonyme ? { groupeHomonyme: true } : {}),
      };
    }
    return { ownerId: o.id, statut: "non_trouve", confiance: meilleur };
  });

  // Passe 2 : collisions (un meme compte 450 revendique "lie" par plusieurs owners -> tous ambigus).
  const compteurParCompte = new Map<string, number>();
  for (const l of liaisons) {
    if (l.statut === "lie" && l.compteSource) {
      compteurParCompte.set(l.compteSource, (compteurParCompte.get(l.compteSource) ?? 0) + 1);
    }
  }
  for (const l of liaisons) {
    if (l.statut === "lie" && l.compteSource && (compteurParCompte.get(l.compteSource) ?? 0) > 1) {
      warnings.push(`owner ${l.ownerId} : compte 450 ${l.compteSource} revendique par plusieurs owners -> a trancher`);
      l.statut = "ambigu";
      l.candidats = [{ compteSource: l.compteSource, confiance: l.confiance ?? 0 }];
      delete l.compteSource;
    }
  }

  // Comptes 450 rattaches a aucun owner "lie".
  const lies = new Set(liaisons.filter((l) => l.statut === "lie" && l.compteSource).map((l) => l.compteSource!));
  const comptesNonLies = comptes450.map((c) => c.compte).filter((c) => !lies.has(c));

  return { liaisons, comptesNonLies, warnings };
}

/**
 * Tranche humaine d'une liaison : rattache (ou detache) le compte 450 choisi a un owner. Pur :
 * renvoie une NOUVELLE liste (ne mute pas l'entree). compteSource null/undefined => "sans compte"
 * (statut non_trouve, tranche). Une liaison tranchee porte `tranchee: true` (tracabilite).
 */
export function trancherLiaison(
  liaisons: LiaisonOwnerCompte[],
  ownerId: string,
  compteSource: string | null,
): LiaisonOwnerCompte[] {
  return liaisons.map((l) => {
    if (l.ownerId !== ownerId) return l;
    if (compteSource && compteSource.trim().length > 0) {
      const c = compteSource.trim();
      const confiance = l.candidats?.find((k) => k.compteSource === c)?.confiance;
      return {
        ownerId: l.ownerId,
        statut: "lie" as StatutLiaison,
        compteSource: c,
        tranchee: true,
        ...(confiance !== undefined ? { confiance } : {}),
      };
    }
    return { ownerId: l.ownerId, statut: "non_trouve" as StatutLiaison, tranchee: true };
  });
}
