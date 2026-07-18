// Tests de l'adapter COUCHE TEXTE UNIQUEMENT : sur un PDF sans couche texte exploitable (scan /
// buffer illisible), il leve une ERREUR EXPLICITE et actionnable, SANS aucun fallback OCR/IA
// (le provider ne contient structurellement aucun appel reseau/IA). Aucune donnee reelle.

import { describe, expect, it } from "vitest";
import {
  CoucheTexteComptaExtractionProvider,
  MESSAGE_ERREUR_COUCHE_TEXTE,
} from "../couche-texte-provider";

describe("CoucheTexteComptaExtractionProvider", () => {
  it("leve l'erreur explicite couche-texte sur un PDF illisible (scan simule)", async () => {
    const provider = new CoucheTexteComptaExtractionProvider();
    // Buffer non-PDF : pdfjs echoue -> erreur explicite, aucun basculement OCR/IA.
    const scan = { nom: "grand livre scanne.pdf", contenu: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]) };
    await expect(provider.extraireGrandLivre([scan])).rejects.toThrow(MESSAGE_ERREUR_COUCHE_TEXTE);
  });

  it("le message d'erreur redirige vers le PDF natif de l'ancien syndic", () => {
    expect(MESSAGE_ERREUR_COUCHE_TEXTE).toMatch(/couche texte/i);
    expect(MESSAGE_ERREUR_COUCHE_TEXTE).toMatch(/natif/i);
  });
});
