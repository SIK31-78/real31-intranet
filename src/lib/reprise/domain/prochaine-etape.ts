// GUIDAGE "prochaine etape" : le domaine PUR qui repond a la question de Sekou "quand on fait
// l'import on ne sait pas quoi faire". A partir de l'ETAT REEL du dossier (jeu present ? erreurs
// bloquantes ? grand livre exploitable ? deja injecte ? fiches generees ?...), on derive UNE
// prochaine action a mettre en avant, dans l'ordre du pipeline de reprise.
//
// Fonction pure et testable (aucune I/O, aucune horloge) : l'appelant (la page server) assemble le
// contexte depuis les etats deja persistes/derivables et rend le bandeau. L'ordre des regles = le
// PREMIER match gagne (pipeline lineaire). PII-free (aucun nom, aucun montant).

/** Tonalite d'affichage du bandeau (couleur). */
export type TonaliteEtape = "normal" | "attention" | "bloque";

/**
 * Identifiant d'ACTION cible : soit une zone de la fiche vers laquelle scroller (`zone:*`), soit une
 * navigation externe (`nav:mapping` = ecran de revue du mapping compta). L'UI mappe cet identifiant
 * a un comportement concret (scroll ancre / lien). Absent = pas de bouton (etape informative).
 */
export type ActionCible =
  | "zone:patrimoine"
  | "zone:compta"
  | "zone:fiches"
  | "zone:suivi"
  | "nav:mapping";

export interface ProchaineEtape {
  titre: string;
  /** Description courte (une phrase), sans PII. */
  description: string;
  /** Action/bouton cible (scroll ou navigation). Absent = pas de bouton. */
  action?: ActionCible;
  /** Libelle du bouton d'action (present ssi `action` l'est). */
  actionLibelle?: string;
  tonalite: TonaliteEtape;
}

/**
 * Etat REEL du dossier, projete par la page. Chaque booleen est derive d'une donnee deja
 * persistee/derivable (jeu, compteurs JSONB, journal, fiches, checklist) - jamais d'un etat invente.
 */
export interface ContexteProchaineEtape {
  /** Un jeu de donnees a-t-il ete extrait (analyse lancee au moins une fois) ? */
  jeuPresent: boolean;
  /** Le patrimoine est-il pret a produire (recap.checks.ok, aucune erreur bloquante) ? */
  pretAProduire: boolean;
  /** Grand livre joint mais non exploitable (scan / couche texte inexploitable) ? */
  comptaErreur: boolean;
  /** Grand livre CLOTURE detecte "avant repartition" (reports 6/7 non nuls) = mauvais document. */
  avantRepartitionBloquant: boolean;
  /** Controle croise cloture <-> en cours en echec (les deux GL ne se raccordent pas). */
  raccordementKO: boolean;
  /** Une injection eStale REELLE a-t-elle eu lieu (trace au journal) ? */
  dejaInjecte: boolean;
  /** Au moins une fiche de renseignements a-t-elle ete generee ? */
  auMoinsUneFicheGeneree: boolean;
  /** Le grand livre de l'exercice EN COURS a-t-il ete fourni (present dans les compteurs) ? */
  comptaEnCoursPresente: boolean;
  /** La revue du mapping compta est-elle tranchee (etape R7 fait/ignore) ? */
  revueMappingFaite: boolean;
  /** La compta est-elle importee dans eStale (etape R8 fait/ignore) ? */
  importComptaFait: boolean;
  /** La reprise est-elle cloturee (etape R11 fait/ignore) ? */
  clotureFaite: boolean;
}

/** Documents attendus de l'ancien syndic (repris de la zone d'upload) - affiche a l'etape 1. */
export const DOCUMENTS_REQUIS: readonly string[] = [
  "PV d'AG de nomination + feuille de presence",
  "RGDD / annexes comptables de la convocation",
  "EDD + RCP et modificatifs",
  "Fiche synthese / registre national",
  "Grand livre N-1 (nom de fichier avec « grand livre » ou « GL »)",
];

/**
 * Derive LA prochaine etape a mettre en avant, dans l'ordre du pipeline (premier match gagne).
 *
 * Ordre (cf. mission) :
 *   1. pas de jeu -> deposer les documents + lancer l'analyse
 *   2. erreurs bloquantes -> corriger via l'editeur (attention)
 *   3. grand livre non exploitable -> redemander un PDF natif (attention)
 *   4. grand livre AVANT repartition -> redemander le GL apres repartition (bloque)
 *   5. raccordement KO -> les deux GL ne se raccordent pas (bloque)
 *   6. pret + pas injecte -> injecter le patrimoine (GO/STOP) - l'action phare
 *   7. injecte + fiches non generees -> generer les fiches de renseignements
 *   8. GL en cours manquant -> fournir le grand livre de l'exercice en cours
 *   9. revue mapping non tranchee -> passer a la revue du mapping / import compta a venir
 *   10. tout fait -> cloturer la reprise
 */
export function prochaineEtape(ctx: ContexteProchaineEtape): ProchaineEtape {
  // 1. Aucune analyse : le point de depart absolu.
  if (!ctx.jeuPresent) {
    return {
      titre: "Depose les documents de l'ancien syndic, puis lance l'analyse",
      description: `Documents attendus : ${DOCUMENTS_REQUIS.join(" ; ")}.`,
      action: "zone:patrimoine",
      actionLibelle: "Deposer les documents",
      tonalite: "normal",
    };
  }

  // 2. Erreurs bloquantes sur le patrimoine : rien n'avance tant qu'elles subsistent.
  if (!ctx.pretAProduire) {
    return {
      titre: "Corrige les erreurs bloquantes",
      description: "Le patrimoine extrait comporte des erreurs (ecart de cle, lot orphelin...). Ouvre l'editeur de corrections pour les lever.",
      action: "zone:patrimoine",
      actionLibelle: "Ouvrir l'editeur de corrections",
      tonalite: "attention",
    };
  }

  // 3. Grand livre joint mais illisible (scan) : redemander un PDF natif.
  if (ctx.comptaErreur) {
    return {
      titre: "Redemande le grand livre en PDF natif",
      description: "Le grand livre transmis n'est pas exploitable (scan / couche texte inexploitable). Redemande un PDF natif a l'ancien syndic, puis relance l'analyse.",
      action: "zone:compta",
      actionLibelle: "Voir le bloc comptabilite",
      tonalite: "attention",
    };
  }

  // 4. Grand livre CLOTURE "avant repartition" = mauvais document (bloquant metier).
  if (ctx.avantRepartitionBloquant) {
    return {
      titre: "Demande le grand livre APRES repartition",
      description: "Le grand livre cloture semble etre la version AVANT repartition (des comptes 6/7 portent encore un solde). Demande a l'ancien syndic la version apres repartition/regule.",
      action: "zone:compta",
      actionLibelle: "Voir le bloc comptabilite",
      tonalite: "bloque",
    };
  }

  // 5. Controle croise cloture <-> en cours en echec : l'un des deux GL est faux.
  if (ctx.raccordementKO) {
    return {
      titre: "Les deux grands livres ne se raccordent pas",
      description: "Les a-nouveaux de l'exercice en cours ne collent pas aux soldes finaux du cloture : l'un des deux grands livres est faux. Verifie les documents avec l'ancien syndic.",
      action: "zone:compta",
      actionLibelle: "Voir le controle croise",
      tonalite: "bloque",
    };
  }

  // 6. Tout est pret cote patrimoine mais rien n'est injecte : L'ACTION PHARE.
  if (!ctx.dejaInjecte) {
    return {
      titre: "Injecte le patrimoine dans eStale (GO/STOP)",
      description: "Le patrimoine est pret a produire. Verifie une derniere fois le cadrage, puis cree la copro et injecte les lots/cles/tantiemes/coproprietaires dans eStale.",
      action: "zone:patrimoine",
      actionLibelle: "Aller a l'injection",
      tonalite: "normal",
    };
  }

  // 7. Injecte mais aucune fiche de renseignements generee : le geste suivant du pipeline.
  if (!ctx.auMoinsUneFicheGeneree) {
    return {
      titre: "Genere les fiches de renseignements",
      description: "Le patrimoine est dans eStale. Genere les courriers « fiche de renseignements » pour recolter les coordonnees des coproprietaires.",
      action: "zone:fiches",
      actionLibelle: "Aller aux fiches de renseignements",
      tonalite: "normal",
    };
  }

  // 8. Manque le grand livre de l'exercice EN COURS (necessaire au controle croise / a la compta).
  if (!ctx.comptaEnCoursPresente) {
    return {
      titre: "Fournis le grand livre de l'exercice en cours",
      description: "Depose le grand livre de l'exercice EN COURS (du 1er jour de l'exercice a la fin de mandat du syndic sortant) pour raccorder la comptabilite au centime.",
      action: "zone:compta",
      actionLibelle: "Voir le bloc comptabilite",
      tonalite: "normal",
    };
  }

  // 9. Revue du mapping compta : lien vers l'ecran dedie (ref pre-remplie), sinon import a venir.
  if (!ctx.revueMappingFaite) {
    return {
      titre: "Passe a la revue du mapping compta",
      description: "Les grands livres se raccordent. Tranche le mapping de chaque compte source vers eStale (warnings, homonymes, coproprietaires partis) dans l'ecran dedie.",
      action: "nav:mapping",
      actionLibelle: "Ouvrir la revue du mapping",
      tonalite: "normal",
    };
  }
  if (!ctx.importComptaFait) {
    return {
      titre: "Import compta : increment a venir",
      description: "La revue du mapping est tranchee. L'import reel de la comptabilite dans eStale (Inc. 3) arrive dans un prochain increment.",
      tonalite: "normal",
    };
  }

  // 10. Tout est fait : reste a cloturer (ou deja cloture).
  if (ctx.clotureFaite) {
    return {
      titre: "Reprise cloturee",
      description: "Toutes les etapes de la reprise sont faites. Le dossier peut etre archive.",
      tonalite: "normal",
    };
  }
  return {
    titre: "Cloture la reprise",
    description: "Toutes les etapes operationnelles sont faites. Verifie les dernieres cases du suivi humain, puis coche la cloture de la reprise.",
    action: "zone:suivi",
    actionLibelle: "Aller au suivi humain",
    tonalite: "normal",
  };
}
