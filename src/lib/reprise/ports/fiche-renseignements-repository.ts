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
}
