// Service : etat de la liste de SECOURS "conseil syndical" d'une copro, pour l'ecran
// d'edition de la fiche. Repond a deux questions distinctes :
//
//   1. La liste de secours est-elle ACTIVE pour le mail de cette copro ? -> derive de la
//      VRAIE cascade (destinatairesConseilSyndical). Si eStale fournit deja des emails de
//      conseil, la liste de secours n'affecte PAS le mail (eStale gagne) ; on doit le dire.
//   2. Quelles adresses de secours sont enregistrees ? -> la liste Crypto/intranet brute
//      (listeCSPourCopro), INDEPENDANTE de la source active : on l'edite meme si eStale gagne.

import { destinatairesConseilSyndical } from "@/lib/services/coproprietes/destinataires-conseil";
import { donneesCoproEstale } from "@/lib/services/estale/donnees-copro-estale";
import { getListesDiffusionProvider } from "@/lib/adapters/router";
import type { SourceDestinataires } from "@/lib/services/coproprietes/destinataires-conseil";

export interface EtatListeSecoursCS {
  /** Source qui alimente REELLEMENT le mail aujourd'hui (eStale / Crypto / aucune). */
  sourceActive: SourceDestinataires;
  /** eStale fournit-il deja les emails du conseil ? Si oui, la liste de secours est inactive
   *  (l'edition ci-dessous ne changera pas le mail tant qu'eStale a des adresses). */
  estaleFournitEmails: boolean;
  /** Adresses qui RECOIVENT REELLEMENT le mail aujourd'hui (eStale ou secours selon la source).
   *  A afficher en lecture pour que le gestionnaire VOIE les destinataires (ex. emails eStale
   *  du conseil), sans avoir a ouvrir le mail. */
  emailsActifs: string[];
  /** Meme liste, avec le NOM du membre du conseil quand on le connait (Sekou 2026-07-28 :
   *  "je ne sais pas qui est testcs2@real31.fr"). `nom` absent = adresse de secours saisie
   *  a la main, non rattachee a un membre du conseil eStale. */
  destinatairesActifs: { email: string; nom?: string }[];
  /** Adresses de secours actuellement enregistrees (Crypto ou editees dans l'intranet). */
  emailsSecours: string[];
}

export async function etatListeSecoursCS(coproCode: string): Promise<EtatListeSecoursCS> {
  const { source, emails } = await destinatairesConseilSyndical(coproCode);
  const liste = await getListesDiffusionProvider().listeCSPourCopro(coproCode);

  // Nommage des destinataires : on rapproche chaque adresse du membre du conseil eStale
  // qui la porte (degrade sans nom si eStale est indisponible ou l'adresse inconnue).
  let parEmail = new Map<string, string>();
  try {
    const estale = await donneesCoproEstale(coproCode);
    parEmail = new Map(
      (estale?.conseilSyndical ?? [])
        .filter((m) => m.email)
        .map((m) => [m.email!.trim().toLowerCase(), m.nomComplet] as const),
    );
  } catch {
    // eStale KO : on affiche les adresses nues, jamais d'echec de la fiche.
  }

  return {
    sourceActive: source,
    estaleFournitEmails: source === "estale",
    emailsActifs: emails,
    destinatairesActifs: emails.map((e) => {
      const nom = parEmail.get(e.trim().toLowerCase());
      return nom ? { email: e, nom } : { email: e };
    }),
    emailsSecours: liste?.emails ?? [],
  };
}
