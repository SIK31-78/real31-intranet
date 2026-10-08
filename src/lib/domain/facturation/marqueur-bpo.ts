// Marqueur « hors BPO » des factures REAL31 (demande Sekou / Léa LOUSSOUARN, 08/10/2026).
//
// BPO Invoices ramasse les factures Pennylane pour les saisir dans CRYPTO. Une copro
// tenue dans ESTALE reçoit ses factures REAL31 directement de l'intranet (REA-11) : si
// BPO la ramassait aussi, elle serait saisie deux fois. Règle convenue avec BPO l'an
// dernier : la chaîne « *** » dans la zone de texte libre d'une facture l'exclut du
// transfert Pennylane -> BPO Invoices.
//
// Toutes les prestations sont concernées, pas seulement la gestion courante : c'est la
// copro qui compte (ESTALE ou CRYPTO), pas le type de facture.

export const MARQUEUR_HORS_BPO = "***";
