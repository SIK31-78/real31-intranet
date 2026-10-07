// L'HTML A4 de l'ODJ rempli : le document est complet, et RIEN de ce qui a ete saisi en
// ligne ne devient du HTML (un paragraphe libre est du texte tape par un collegue).

import { describe, expect, it } from "vitest";
import type { ArbreOdj } from "./odj-rendu";
import { htmlOdj } from "./odj-html";

const ARBRE: ArbreOdj = {
  titre: "Préparation d'assemblée générale",
  sousTitre: "Document issu du conseil syndical",
  copro: { code: "S146", nom: "Les Marronniers", adresse: "12 rue des Lilas" },
  reunion: [
    { type: "ligne", libelle: "Conseil syndical du", valeur: "05/10/2026", paragraphe: false },
    { type: "ligne", libelle: "Lieu", valeur: "", paragraphe: false },
  ],
  sections: [
    {
      numero: 1,
      titre: "Vérification des comptes",
      noeuds: [
        { type: "ligne", libelle: "Budget", valeur: "45 000,00 €", paragraphe: false },
        { type: "ligne", libelle: "Eau", valeur: "Deux\nlignes", paragraphe: true },
        { type: "paragraphe", texte: "Trop-perçu rendu au T1." },
        { type: "point", titre: "PPT", texte: "Soumis au vote." },
      ],
    },
  ],
  blocsFin: ["Le CS valide."],
  finReunion: "20h30",
  mentions: ["SAS au capital de 90 000 €"],
};

describe("htmlOdj", () => {
  it("rend un document A4 autonome, avec tout le contenu", () => {
    const html = htmlOdj(ARBRE);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("@page { size: A4;");
    expect(html).toContain("Les Marronniers");
    expect(html).toContain("1.</span>Vérification des comptes");
    expect(html).toContain("Trop-perçu rendu au T1.");
    expect(html).toContain("PPT");
    expect(html).toContain("Le CS valide.");
    expect(html).toContain("20h30");
    expect(html).toContain("SAS au capital de 90 000");
  });

  it("garde un TRAIT pour une valeur non saisie (le lecteur la complete a la main)", () => {
    expect(htmlOdj(ARBRE)).toContain('<span class="blanc"></span>');
  });

  it("ECHAPPE tout ce qui vient d'une saisie : du HTML tape reste du texte", () => {
    const a: ArbreOdj = {
      ...ARBRE,
      blocsFin: ['<script>alert("x")</script> & "guillemets"'],
      copro: { ...ARBRE.copro, nom: "Résidence <b>A</b>" },
    };
    const html = htmlOdj(a);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Résidence &lt;b&gt;A&lt;/b&gt;");
  });

  it("embarque le logo et les polices quand on les lui donne", () => {
    const html = htmlOdj(ARBRE, "data:image/png;base64,AAA", "@font-face { font-family: Aptos; }");
    expect(html).toContain('<img src="data:image/png;base64,AAA"');
    expect(html).toContain("@font-face");
  });
});
