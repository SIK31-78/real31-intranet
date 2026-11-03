// Marqueur « hors BPO » des factures REAL31 (demande Sekou / Léa LOUSSOUARN, 08/10/2026).
//
// BPO Invoices ramasse les factures Pennylane pour les saisir dans CRYPTO. Une copro
// tenue dans ESTALE reçoit ses factures REAL31 directement de l'intranet (REA-11) : si
// BPO la ramassait aussi, elle serait saisie deux fois. Règle convenue avec BPO l'an
// dernier : la chaîne « *** » dans la zone de texte libre d'une facture l'exclut du
// transfert Pennylane -> BPO Invoices.
//
// Le marqueur doit ouvrir le texte libre (« *** - S302 »), comme dans les factures
// saisies à la main. Placé à la fin (« S302 *** »), il n'est pas vu : F-2026-10-47346
// est arrivée dans BPO le 29/10/2026. C'était la seule, sur 1 022 factures marquées
// depuis 2025, à porter le marqueur ailleurs qu'en tête.
//
// Toutes les prestations sont concernées, pas seulement la gestion courante : c'est la
// copro qui compte (ESTALE ou CRYPTO), pas le type de facture.

export const MARQUEUR_HORS_BPO = "***";
