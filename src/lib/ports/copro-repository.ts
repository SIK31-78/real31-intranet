// Port (contrat) du referentiel copropriete.
// Source reelle a terme : App A (public.Copropriete), lue via un adapter.
// Ne depend que du domaine.

import type { Copropriete } from "@/lib/domain/copropriete";
import type { NouvelleCopro } from "@/lib/domain/proposition/election";

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
  /**
   * Perd une copropriete : la passe INACTIVE dans le referentiel partage (App A). La
   * trace (quand, pourquoi, qui, ou en est la sortie) est le DOSSIER DE PERTE
   * (ports/perte-repository), pas ce port. Hors cloisonnement : geste d'equipe.
   * Leve si la copro est inconnue.
   */
  perdreCopro(input: CoproPerdueInput): Promise<void>;
  /**
   * Cree une copropriete dans le referentiel partage (App A) : une proposition elue qui
   * entre en gestion (ADR-039, brique 3). Leve si le code existe deja.
   */
  creerCopro(input: NouvelleCopro): Promise<void>;
}

export interface CoproPerdueInput {
  coproCode: string;
  /** Dernier jour gere, ISO. */
  finGestionISO: string;
  /** Nom complet de qui acte la perte. */
  par: string;
}
