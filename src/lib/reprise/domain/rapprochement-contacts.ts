// Domaine PUR du RAPPROCHEMENT des contacts d'annexe <-> owners du jeu (aucune I/O).
//
// Les documents annexes (liste coproprietaires, courrier, avis de mutation...) portent des
// contacts nominatifs (email/telephone) qui valent de l'or pour la reprise (80 % des owners
// n'ont pas d'email connu apres l'AG). On rapproche chaque contact du nom des owners deja
// extraits pour PROPOSER a l'humain d'enrichir l'owner avec l'email/telephone du contact.
//
// AUCUN enrichissement automatique : on ne fait que PROPOSER. Chaque rapprochement est PERSISTE
// en attente et VALIDE (ou corrige / ignore) par l'humain (comme la liaison 450 ambigue).
//
// On REUTILISE le scoring conservateur de mapping-compta (normaliserNom + scoreAppariement +
// memes seuils que la liaison 450) : appariement fort ET non ambigu => "sur" ; sinon "ambigu"
// (owner probable, a confirmer) ou "inconnu" (aucun owner apparie de facon fiable). Un owner
// homonyme (deux owners au meme nom normalise) retrograde le contact en "ambigu" (jamais un
// enrichissement silencieux sur le mauvais homonyme).
//
// PII : ce module manipule des noms/emails/telephones UNIQUEMENT pour le calcul et le portage de
// la proposition ; il ne recopie JAMAIS de nom/email dans un message technique (jamais logue).

import type { Owner } from "@/lib/reprise/domain/patrimoine";
import type { ContactAnnexe } from "@/lib/reprise/ports/extraction-annexe-provider";
import { nomOwner } from "@/lib/reprise/domain/liaison-comptes";
import {
  normaliserNom,
  scoreAppariement,
  MARGE_AMBIGUITE,
  SEUIL_APPARIEMENT_FORT,
  SEUIL_APPARIEMENT_MINI,
} from "@/lib/reprise/domain/mapping-compta";

/** Statut du rapprochement d'un contact vers un owner du jeu. */
export type StatutRapprochement = "sur" | "ambigu" | "inconnu";

/**
 * Un contact d'annexe rapproche d'un owner (ou non). Porte ses propres donnees (nom/email/
 * telephone) + le resultat du rapprochement. `traite` est la DECISION HUMAINE additive (validee
 * ou ignoree) : absente tant que l'humain n'a pas tranche.
 */
export interface ContactRapproche {
  /** Identifiant stable dans le lot (ordre d'apparition), pour cibler la decision humaine. */
  id: string;
  /** Nom imprime sur l'annexe (PII). */
  nom: string;
  /** Email trouve (PII). */
  email?: string;
  /** Telephone trouve (PII). */
  telephone?: string;
  /** Owner apparie (ou re-cible par l'humain). */
  ownerId?: string;
  /** Score du meilleur candidat (0..1). */
  confiance: number;
  statut: StatutRapprochement;
  /** Decision humaine (additif) : la donnee a ete ecrite sur l'owner, ou la proposition ecartee. */
  traite?: "valide" | "ignore";
}

/** Metadonnee d'une annexe analysee (persistee pour l'affichage : nom + type + resume). */
export interface AnnexeAnalysee {
  /** Nom de fichier de l'annexe. */
  nom: string;
  /** Type detecte (libre). */
  typeDetecte: string;
  /** Resume court. */
  resume: string;
}

/** Owners partageant le MEME nom normalise (>= 2) : leurs ids (rapprochement ambigu force). */
function ownersHomonymes(owners: Owner[]): Set<string> {
  const parNom = new Map<string, string[]>();
  for (const o of owners) {
    const cle = normaliserNom(nomOwner(o));
    if (!cle) continue;
    const arr = parNom.get(cle) ?? [];
    arr.push(o.id);
    parNom.set(cle, arr);
  }
  const membres = new Set<string>();
  for (const arr of parNom.values()) if (arr.length >= 2) for (const id of arr) membres.add(id);
  return membres;
}

/** Meilleur + second score d'un nom de contact contre la liste des owners. */
function apparier(nom: string, owners: Owner[]): { meilleur: number; second: number; ownerId?: string } {
  let meilleur = -1;
  let second = -1;
  let ownerId: string | undefined;
  for (const o of owners) {
    const s = scoreAppariement(nom, nomOwner(o));
    if (s > meilleur) {
      second = meilleur;
      meilleur = s;
      ownerId = o.id;
    } else if (s > second) {
      second = s;
    }
  }
  return { meilleur: meilleur < 0 ? 0 : meilleur, second: second < 0 ? 0 : second, ownerId };
}

/**
 * Rapproche une liste de contacts (extraits d'annexes) des owners du jeu. Pur : meme entree =>
 * meme sortie. Regles calquees sur la liaison 450 :
 *   - meilleur score >= SEUIL_APPARIEMENT_FORT, non ambigu (2e candidat < seuil mini ou marge
 *     suffisante), owner NON homonyme -> "sur" (proposition forte, a valider) ;
 *   - meilleur score >= SEUIL_APPARIEMENT_MINI mais faible/ambigu/homonyme -> "ambigu" (owner
 *     probable, a confirmer) ;
 *   - sinon -> "inconnu" (aucun owner fiable).
 * Un contact sans email NI telephone reste rapproche (l'info peut venir d'ailleurs), mais il n'y
 * a rien a ecrire : l'UI le signalera.
 */
export function rapprocherContacts(contacts: ContactAnnexe[], owners: Owner[]): ContactRapproche[] {
  const homonymes = ownersHomonymes(owners);
  return contacts.map((c, i) => {
    const base = {
      id: `contact-${i}`,
      nom: c.nom,
      ...(c.email ? { email: c.email } : {}),
      ...(c.telephone ? { telephone: c.telephone } : {}),
    };
    const nom = (c.nom ?? "").trim();
    if (!nom || owners.length === 0) {
      return { ...base, statut: "inconnu" as StatutRapprochement, confiance: 0 };
    }
    const { meilleur, second, ownerId } = apparier(nom, owners);
    const ambiguScore = second >= SEUIL_APPARIEMENT_MINI && meilleur - second < MARGE_AMBIGUITE;
    const estHomonyme = ownerId !== undefined && homonymes.has(ownerId);

    if (ownerId && meilleur >= SEUIL_APPARIEMENT_FORT && !ambiguScore && !estHomonyme) {
      return { ...base, statut: "sur" as StatutRapprochement, ownerId, confiance: meilleur };
    }
    if (ownerId && meilleur >= SEUIL_APPARIEMENT_MINI) {
      return { ...base, statut: "ambigu" as StatutRapprochement, ownerId, confiance: meilleur };
    }
    return { ...base, statut: "inconnu" as StatutRapprochement, confiance: meilleur };
  });
}

/**
 * Re-cible un contact vers un AUTRE owner (geste humain "Corriger"). Pur : renvoie une nouvelle
 * liste. Passe le statut a "sur" (choix humain) sans toucher au reste. No-op si l'id est inconnu.
 */
export function reciblerContact(
  contacts: ContactRapproche[],
  id: string,
  ownerId: string,
): ContactRapproche[] {
  return contacts.map((c) =>
    c.id === id ? { ...c, ownerId, statut: "sur" as StatutRapprochement } : c,
  );
}

/**
 * Marque un contact comme traite (valide = donnee ecrite sur l'owner, ou ignore = proposition
 * ecartee). Pur. `ownerId` fixe l'owner effectivement enrichi (pour la validation). No-op si id
 * inconnu.
 */
export function marquerContact(
  contacts: ContactRapproche[],
  id: string,
  traite: "valide" | "ignore",
  ownerId?: string,
): ContactRapproche[] {
  return contacts.map((c) =>
    c.id === id ? { ...c, traite, ...(ownerId ? { ownerId } : {}) } : c,
  );
}

/** Prefixe une precision d'annexe pour qu'elle soit classee "vigilance" (cf. classement-notes). */
export function noteVigilanceAnnexe(typeDetecte: string, point: string): string {
  // Contient "vigilance" et "a verifier" -> classement-notes la range en niveau "vigilance".
  return `Document annexe (${typeDetecte}) - point de vigilance : ${point} (a verifier).`;
}
