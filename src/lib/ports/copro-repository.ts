// Port (contrat) du referentiel copropriete.
// Source reelle a terme : App A (public.Copropriete), lue via un adapter.
// Ne depend que du domaine.

import type { Copropriete } from "@/lib/domain/copropriete";

export interface CoproRepository {
  /** Liste les copros ; si managerId fourni, cloisonne au gestionnaire (cloisonnement). */
  list(managerId?: string): Promise<Copropriete[]>;
  /** Toutes les copros actives AVEC leur equipe resolue (gestionnaire compris), pour les
   *  vues TRANSVERSES non cloisonnees (ex. dashboard du pole comptable). `list()` ne resout
   *  pas l'equipe en mode Supabase ; celle-ci la resout (une requete User batch, pas de N+1). */
  listerToutes(): Promise<Copropriete[]>;
  /** Renvoie la copro par son code, ou null si introuvable / hors scope du gestionnaire. */
  findByCode(code: string, managerId?: string): Promise<Copropriete | null>;
  /** Definit une date d'AG ou de CS (null = deplanifier / effacer). `quand` choisit
   *  la prochaine (planifiee) ou la derniere (tenue). Scope managerId : n'agit que
   *  sur une copro du gestionnaire. */
  setDateEvenement(
    coproCode: string,
    type: "ag" | "cs",
    quand: "prochaine" | "derniere",
    dateISO: string | null,
    managerId: string,
  ): Promise<void>;
}
