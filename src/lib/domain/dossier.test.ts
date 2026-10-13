// Tests des derivateurs PURS ajoutes pour l'accueil "Mes dossiers en cours" (variante C) :
// segmentAffaire (3 segments A traiter / En cours / A clore), indexEtapeEnCours et
// actionEtape (heuristique courrier des sinistres). Zero dependance technique.

import { describe, expect, it } from "vitest";
import {
  segmentAffaire,
  indexEtapeEnCours,
  actionEtape,
  MODELES_ETAPES,
  modifierNoteJournal,
  TYPE_DOSSIER_LABEL,
  TYPE_DOSSIER_ORDRE,
  TYPE_DOSSIER_TON,
  type Dossier,
  type EvenementDossier,
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

describe("type Dommage-Ouvrage (REA-152)", () => {
  it("a son libelle, sa place dans la liste et les etapes validees par Sekou", () => {
    expect(TYPE_DOSSIER_LABEL.dommage_ouvrage).toBe("Dommage-Ouvrage");
    expect(TYPE_DOSSIER_ORDRE).toContain("dommage_ouvrage");
    expect(MODELES_ETAPES.dommage_ouvrage.map((e) => e.label)).toEqual([
      "Déclaration à l'assureur DO",
      "Accusé de réception de l'assureur",
      "Expertise",
      "Position de garantie",
      "Indemnisation",
      "Travaux de reprise",
      "Clôture",
    ]);
  });
  it("chaque type de la liste a un libelle, un ton et un modele d'etapes", () => {
    for (const t of TYPE_DOSSIER_ORDRE) {
      expect(TYPE_DOSSIER_LABEL[t]).toBeTruthy();
      expect(TYPE_DOSSIER_TON[t]).toBeTruthy();
      expect(Array.isArray(MODELES_ETAPES[t])).toBe(true);
    }
  });
});

describe("modifierNoteJournal (REA-139)", () => {
  const journal: EvenementDossier[] = [
    { le: "2026-10-01T08:00:00.000Z", par: "SK", texte: "Dossier ouvert", kind: "statut" },
    { le: "2026-10-02T08:00:00.000Z", par: "SK", texte: "Appel au syndic", kind: "note" },
    { le: "2026-10-03T08:00:00.000Z", par: "EL", texte: "Devis reçu", kind: "note" },
  ];
  const quand = "2026-10-12T09:00:00.000Z";

  it("modifie ma note, garde sa date de creation et date la modification", () => {
    const next = modifierNoteJournal(journal, { le: journal[1].le, par: "SK" }, "  Appel au gardien  ", quand);
    expect(next?.[1]).toEqual({ ...journal[1], texte: "Appel au gardien", modifieLe: quand });
    expect(next?.[0]).toBe(journal[0]);
    expect(next?.[2]).toBe(journal[2]);
    expect(journal[1].texte).toBe("Appel au syndic"); // pas de mutation
  });
  it("refuse la note d'un autre", () => {
    expect(modifierNoteJournal(journal, { le: journal[2].le, par: "SK" }, "Pirate", quand)).toBeNull();
  });
  it("refuse une entree qui n'est pas une note", () => {
    expect(modifierNoteJournal(journal, { le: journal[0].le, par: "SK" }, "Autre", quand)).toBeNull();
  });
  it("refuse un texte vide ou inchange, et une note introuvable", () => {
    expect(modifierNoteJournal(journal, { le: journal[1].le, par: "SK" }, "   ", quand)).toBeNull();
    expect(modifierNoteJournal(journal, { le: journal[1].le, par: "SK" }, "Appel au syndic", quand)).toBeNull();
    expect(modifierNoteJournal(journal, { le: "2020-01-01", par: "SK" }, "x", quand)).toBeNull();
  });
});
