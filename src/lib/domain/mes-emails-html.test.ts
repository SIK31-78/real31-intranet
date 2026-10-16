import { describe, expect, it } from "vitest";
import { htmlMailMisEnForme, htmlVersTexte, lienSur, nettoyerHtmlMail, texteVersHtml } from "./mes-emails-html";

// REA-345 : ce qui part dans un mail mis en forme. La liste blanche est la seule défense
// contre un HTML forgé côté navigateur : chaque contournement connu a son test.

describe("nettoyerHtmlMail : ce qui passe", () => {
  it("garde gras, italique, listes, paragraphes et sauts de ligne", () => {
    expect(nettoyerHtmlMail("<p>Bonjour <b>Mme</b> <i>Pin</i>,<br>voici :</p><ul><li>un</li><li>deux</li></ul><ol><li>x</li></ol>")).toBe(
      "<p>Bonjour <b>Mme</b> <i>Pin</i>,<br>voici :</p><ul><li>un</li><li>deux</li></ul><ol><li>x</li></ol>",
    );
  });
  it("ramène strong/em à b/i et les div de l'éditeur à des paragraphes", () => {
    expect(nettoyerHtmlMail("<div><strong>a</strong></div><div><em>b</em></div>")).toBe("<p><b>a</b></p><p><i>b</i></p>");
  });
  it("garde les liens http(s) et mailto, sans autre attribut", () => {
    expect(nettoyerHtmlMail('<a href="https://real31.fr/x?a=1&amp;b=2" target="_blank" onclick="x()">site</a>')).toBe(
      '<a href="https://real31.fr/x?a=1&amp;b=2">site</a>',
    );
    expect(nettoyerHtmlMail("<a href='mailto:elsa@real31.fr'>Elsa</a>")).toBe('<a href="mailto:elsa@real31.fr">Elsa</a>');
  });
  it("garde le texte des balises inconnues (span, font, Word) sans leurs attributs", () => {
    expect(nettoyerHtmlMail('<span style="color:red" class="MsoNormal"><font face="Arial">texte</font></span>')).toBe("texte");
  });
});

describe("nettoyerHtmlMail : ce qui ne passe pas", () => {
  it("supprime script, style, iframe AVEC leur contenu, et les commentaires", () => {
    expect(nettoyerHtmlMail("a<script>alert(1)</script>b<style>p{}</style>c<iframe src=x>d</iframe>e<!-- secret -->f")).toBe("abcef");
  });
  it("retire tous les attributs d'événement et de style", () => {
    expect(nettoyerHtmlMail('<b onmouseover="x()" style="x">a</b><img src=x onerror=alert(1)>')).toBe("<b>a</b>");
  });
  it("refuse javascript:, data: et leurs déguisements, en gardant le texte", () => {
    for (const href of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "&#106;avascript:alert(1)", "java&#x09;script:x", "java\tscript:x", "data:text/html,x", "vbscript:x", "//evil.fr", "/relatif"]) {
      expect(nettoyerHtmlMail(`<a href="${href}">clic</a>`)).toBe("clic");
    }
  });
  it("échappe le texte et un < isolé ; ne double pas les entités", () => {
    expect(nettoyerHtmlMail("a < b &amp; c > d &lt;script&gt;")).toBe("a &lt; b &amp; c &gt; d &lt;script&gt;");
  });
  it("équilibre les balises : fermetures orphelines ignorées, ouvertes refermées", () => {
    expect(nettoyerHtmlMail("</b>a<b>b<i>c")).toBe("a<b>b<i>c</i></b>");
    expect(nettoyerHtmlMail("<b>a<i>b</b>c</i>")).toBe("<b>a<i>b</i></b>c");
  });
  it("un attribut qui ferme la balise ne casse rien", () => {
    expect(nettoyerHtmlMail('<a href="https://x.fr" title="a>b">t</a>')).not.toContain("title");
  });
});

describe("lienSur", () => {
  it("accepte http, https, mailto ; refuse le reste", () => {
    expect(lienSur("https://x.fr")).toBe("https://x.fr");
    expect(lienSur("MAILTO:a@b.fr")).toBe("MAILTO:a@b.fr");
    expect(lienSur("ftp://x")).toBeNull();
    expect(lienSur("javascript:x")).toBeNull();
  });
});

describe("texte <-> HTML", () => {
  it("un modèle en texte passe dans l'éditeur et revient identique", () => {
    const t = "Madame, Monsieur,\n\nImmeuble concerné : S247 · 12 rue <des> Lilas & Cie\n\nCordialement";
    expect(texteVersHtml(t)).toBe("Madame, Monsieur,<br><br>Immeuble concerné : S247 · 12 rue &lt;des&gt; Lilas &amp; Cie<br><br>Cordialement");
    expect(htmlVersTexte(texteVersHtml(t))).toBe(t);
  });
  it("le texte équivalent d'un HTML mis en forme : paragraphes, puces, entités", () => {
    expect(htmlVersTexte("<p>Bonjour&nbsp;<b>Mme</b></p><ul><li>un</li><li>deux</li></ul><p>Fin &amp; merci</p>")).toBe(
      "Bonjour Mme\n\n- un\n- deux\n\nFin & merci",
    );
    expect(htmlVersTexte("<p><br></p>")).toBe("");
  });
});

describe("htmlMailMisEnForme", () => {
  it("nettoie, pose la police du cabinet et des paragraphes sans marge", () => {
    expect(htmlMailMisEnForme("<div>a</div><script>x</script>")).toBe(
      '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt"><p style="margin:0">a</p></div>',
    );
  });
});
