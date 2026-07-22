// Tests des derivateurs PURS ajoutes pour l'accueil "Mes dossiers en cours" (variante C) :
// segmentAffaire (3 segments A traiter / En cours / A clore), indexEtapeEnCours et
// actionEtape (heuristique courrier des sinistres). Zero dependance technique.

import { describe, expect, it } from "vitest";
import {
  segmentAffaire,
  indexEtapeEnCours,
  actionEtape,
  type Dossier,
  type EtapeDossier,
  type StatutDossier,
} from "@/lib/domain/dossier";

function etape(label: string, fait: boolean, extra: Partial<EtapeDossier> = {}): EtapeDossier {
  return { id: label, label, fait, ...extra };
}

function dossier(statut: StatutDossier, etapes: EtapeDossier[], type: Dossier["type"] = "autre"): Dossier {
  return {
    id: "d1",
    coproCode: "A",
    type,
    portee: "copropriete",
    titre: "Test",
    statut,
    ouvertLe: "2026-07-01",
    etapes,
    journal: [],
  };
}

describe("segmentAffaire", () => {
  it("clos -> en_cours (jamais 'a clore', deja traite)", () => {
    expect(segmentAffaire(dossier("clos", [etape("x", true)]))).toBe("en_cours");
  });

  it("toutes les etapes faites (non clos) -> a_clore", () => {
    expect(segmentAffaire(dossier("en_cours", [etape("x", true), etape("y", true)]))).toBe("a_clore");
    // Meme si le statut est encore 'ouvert', tout-fait prime -> a clore.
    expect(segmentAffaire(dossier("ouvert", [etape("x", true)]))).toBe("a_clore");
  });

  it("aucune etape faite (N>=1) -> a_traiter (rien n'a demarre)", () => {
    expect(segmentAffaire(dossier("en_cours", [etape("x", false), etape("y", false)]))).toBe("a_traiter");
  });

  it("statut ouvert sans etape -> a_traiter (pris en main, rien de demarre)", () => {
    expect(segmentAffaire(dossier("ouvert", []))).toBe("a_traiter");
  });

  it("progression partielle -> en_cours", () => {
    expect(segmentAffaire(dossier("en_cours", [etape("x", true), etape("y", false), etape("z", false)]))).toBe(
      "en_cours",
    );
  });

  it("sans etape et pas 'ouvert' -> en_cours (rien a derouler)", () => {
    expect(segmentAffaire(dossier("en_cours", []))).toBe("en_cours");
  });
});

describe("indexEtapeEnCours", () => {
  it("renvoie l'index de la premiere etape non faite", () => {
    expect(indexEtapeEnCours({ etapes: [etape("a", true), etape("b", false), etape("c", false)] })).toBe(1);
  });
  it("-1 si tout est fait", () => {
    expect(indexEtapeEnCours({ etapes: [etape("a", true), etape("b", true)] })).toBe(-1);
  });
  it("-1 si aucune etape", () => {
    expect(indexEtapeEnCours({ etapes: [] })).toBe(-1);
  });
});

describe("actionEtape", () => {
  it("undefined hors sinistre", () => {
    expect(actionEtape({ id: "d1", type: "travaux" }, etape("Envoyer le courrier C5", false))).toBeUndefined();
  });
  it("undefined si l'etape ne parle pas de courrier", () => {
    expect(actionEtape({ id: "d1", type: "sinistre" }, etape("Expertise", false))).toBeUndefined();
  });
  it("cible le code courrier detecte + passe ?dossier", () => {
    const a = actionEtape({ id: "d1", type: "sinistre" }, etape("Envoyer le courrier C5", false));
    expect(a).toEqual({
      kind: "courrier",
      href: "/sinistre/courriers/C5?dossier=d1",
      label: "Rédiger le courrier C5",
    });
  });
  it("selecteur d'index si aucun code reconnu", () => {
    const a = actionEtape({ id: "d1", type: "sinistre" }, etape("Envoyer le courrier au syndic", false));
    expect(a?.href).toBe("/sinistre/courriers?dossier=d1");
    expect(a?.label).toBe("Rédiger le courrier");
  });
});
