// Port (contrat) de persistance des FICHES DE RENSEIGNEMENTS coproprietaire. Ne dit RIEN du
// comment (memoire ? Supabase ?). Ne depend que du domaine. Cle metier : (coproCode, ownerId).
//
// Le lookup public se fait par tokenHash (le token en clair vit dans le lien ; on ne stocke
// que son hash). obtenirParTokenHash sert la route publique /fiche/[token].

import type { FicheRenseignement } from "@/lib/reprise/domain/fiche-renseignements";

export interface FicheRenseignementsRepository {
  /** Toutes les fiches d'une copro (suivi + validation cote gestionnaire). Vide si table absente. */
  listerParDossier(coproCode: string): Promise<FicheRenseignement[]>;
  /** Fiche correspondant a un hash de token, ou null (lookup public par le lien). */
  obtenirParTokenHash(tokenHash: string): Promise<FicheRenseignement | null>;
  /** Cree ou remplace une fiche (upsert, cle = coproCode + ownerId). */
  sauver(fiche: FicheRenseignement): Promise<void>;
  /**
   * Supprime TOUTES les fiches d'une copro (suppression definitive d'un dossier de reprise).
   * Renvoie le nombre de fiches supprimees (pour tracer/annoncer ce qui part). No-op propre si
   * la table est absente ou si aucune fiche n'existe.
   */
  supprimerParDossier(coproCode: string): Promise<number>;
}
