// Fixture de test : la petite copro CANONIQUE deterministe (3 lots, 1 cle, 3 owners).
// Historiquement produite par le MockExtractionProvider (adapter IA supprime a la refonte
// "entree par fichiers Excel") ; les tests d'injection/onboarding n'ont besoin QUE du jeu.

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

/** Jeu canonique complet et coherent (auto-checks verts). Nouvel objet a chaque appel. */
export function jeuCanonique(): JeuDeDonnees {
  return {
    lots: [
      { numero: 1, type: "Appartement", usage: "residential", etage: 0, surface: 52, nbPiece: 3, commentaire: "T3 RDC" },
      { numero: 2, type: "Appartement", usage: "residential", etage: 1, surface: 48, nbPiece: 2, commentaire: "T2 1er" },
      { numero: 3, type: "Parking", usage: "parking", etage: -1, commentaire: "Parking sous-sol" },
    ],
    cles: [{ code: "001", libelle: "Charges générales", totalAttendu: 1000, defaut: true }],
    tantiemes: [
      { cleCode: "001", lot: 1, valeur: 450 },
      { cleCode: "001", lot: 2, valeur: 400 },
      { cleCode: "001", lot: 3, valeur: 150 },
    ],
    owners: [
      { id: "o1", civilite: "m&mme", nom: "DUPONT", prenom: "Jean & Marie", pro: false },
      { id: "o2", civilite: "mme", nom: "MARTIN", prenom: "Claire", pro: false },
      { id: "o3", civilite: "m", nom: "SCI BELLEVUE", pro: true, formeJuridique: "SCI", raisonSociale: "SCI BELLEVUE" },
    ],
    attributions: [
      { ownerId: "o1", lot: 1 },
      { ownerId: "o2", lot: 2 },
      { ownerId: "o3", lot: 3 },
    ],
  };
}
