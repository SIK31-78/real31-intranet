// Orchestrateur d'ONBOARDING d'une copro : cree la copro cote eStale PUIS injecte tout
// son patrimoine, en une sequence. C'est le point d'entree "de bout en bout" quand la
// copro n'existe pas encore dans eStale (cas d'une reprise).
//
// Il ne fait que composer deux briques existantes :
//   1. provider.creerCopro(metadonnees) -> condoID (createCondo) ;
//   2. injecterPatrimoine(provider, condoID, jeu) -> le reste (lots -> ... -> links).
//
// Comme le reste du module : parle UNIQUEMENT au port EstaleEcritureProvider (hexagonal).
// Selon le provider injecte (dry-run ou reel), c'est une simulation ou une ecriture PROD ;
// l'orchestrateur ignore lequel. Deux modes d'appel :
//   - metadonnees copro fournies + pas de condoID -> on cree la copro d'abord ;
//   - condoID deja connu -> on saute la creation (copro deja dans eStale).

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type {
  EstaleEcritureProvider,
  CondoManagementEstale,
  AddressInputEstale,
} from "@/lib/reprise/ports/estale-ecriture-provider";
import { injecterPatrimoine, type RapportInjection } from "@/lib/reprise/services/injecter-patrimoine";

/** Metadonnees necessaires pour createCondo (volet copro, hors patrimoine). */
export interface MetadonneesCopro {
  name: string;
  reference: string;
  management: CondoManagementEstale;
  establishmentID: string;
  address: AddressInputEstale;
}

export interface RapportOnboarding {
  /** true si la copro a ete creee par cet appel (false si condoID etait deja fourni). */
  coproCreee: boolean;
  /** Le condoID utilise pour l'injection (cree ou fourni). */
  condoID: string;
  /** Le rapport d'injection du patrimoine (ordre, compteurs, IDs, avertissements...). */
  injection: RapportInjection;
  /** true si tout s'est deroule sans erreur (creation + injection). */
  succes: boolean;
  /** Renseigne si la CREATION de la copro elle-meme a echoue (avant toute injection). */
  erreurCreation?: string;
}

/**
 * Deroule l'onboarding complet.
 *
 * - Si `condoID` est fourni : on saute createCondo et on injecte directement dedans.
 * - Sinon `metadonnees` est requis : on cree la copro (createCondo), on capture le condoID,
 *   PUIS on injecte le patrimoine.
 *
 * Ne LEVE PAS pour un echec d'injection (celui-ci est capture dans injection.erreur).
 * En revanche, si la creation de la copro echoue, on s'arrete AVANT d'injecter (rien a
 * injecter sans condoID) et on renvoie un rapport en echec avec erreurCreation.
 */
export async function onboarderCopro(
  provider: EstaleEcritureProvider,
  jeu: JeuDeDonnees,
  cible: { condoID: string } | { metadonnees: MetadonneesCopro },
): Promise<RapportOnboarding> {
  let condoID: string;
  let coproCreee = false;

  if ("condoID" in cible) {
    condoID = cible.condoID;
  } else {
    try {
      const { id } = await provider.creerCopro(cible.metadonnees);
      condoID = id;
      coproCreee = true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Creation impossible : on ne peut rien injecter. Rapport en echec, injection vide.
      return {
        coproCreee: false,
        condoID: "",
        injection: {
          condoID: "",
          operations: [],
          compteurs: { lots: 0, cles: 0, tantiemes: 0, owners: 0, links: 0 },
          ids: { lotParNum: {}, cleParCode: {}, ownerParId: {} },
          avertissements: [],
          rollback: [],
          erreur: { operation: "createCondo", cibleDomaine: cible.metadonnees.reference, message },
          succes: false,
        },
        succes: false,
        erreurCreation: message,
      };
    }
  }

  const injection = await injecterPatrimoine(provider, condoID, jeu);

  return {
    coproCreee,
    condoID,
    injection,
    succes: injection.succes,
  };
}
