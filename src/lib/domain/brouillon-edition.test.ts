import { describe, expect, it } from "vitest";
import { brouillonModifiable, decouperCorpsBrouillon, recomposerCorpsBrouillon } from "./brouillon-edition";

// Rouvrir un brouillon dans l'éditeur riche (02/11/2026) : seule la partie écrite passe par
// l'éditeur ; signature et historique restent à l'octet près ; la signature n'est jamais
// ajoutée deux fois.

const SIG = '<table class="sig"><tr><td><b>Julie MARTIN</b><br/>Gestionnaire de copropriété, REAL31</td></tr></table>';
const doc = (body: string) => `<html><head>\r\n<style>.sig{color:#333}</style></head><body dir="ltr">\r\n${body}\r\n</body>\r\n</html>`;

describe("decouperCorpsBrouillon", () => {
  it("brouillon de l'intranet : la signature est isolée, malgré les blancs et <br> réécrits par Exchange", () => {
    const html = doc(`<div style="font-family:Aptos">Bonjour,<br>Voici le devis.</div><br>\r\n${SIG.replace("<br/>", "<br>")}`);
    const d = decouperCorpsBrouillon(html, SIG);
    expect(d.signature).toBe("isolee");
    expect(d.citation).toBe(false);
    expect(d.editable).toBe('<div style="font-family:Aptos">Bonjour,<br>Voici le devis.</div><br>');
    expect(d.suite.startsWith("<table")).toBe(true);
    expect(d.avant).toContain("<style>.sig{color:#333}</style>");
    // Recomposé : le nouveau texte, la MÊME signature, pas une deuxième.
    const r = recomposerCorpsBrouillon(d, "<div>Nouveau</div>", SIG);
    expect(r.match(/Julie MARTIN/g)).toHaveLength(1);
    expect(r).toContain("<div>Nouveau</div><table");
    expect(r.endsWith("</body></html>")).toBe(true);
  });

  it("réponse préparée dans Outlook : l'historique cité est gardé, la signature absente est ajoutée avant lui", () => {
    const html = doc('<div>Ma réponse</div><div id="appendonsend"></div><hr><div id="divRplyFwdMsg"><b>De :</b> M. Dupont</div><div>Message d\'origine</div>');
    const d = decouperCorpsBrouillon(html, SIG);
    expect(d.citation).toBe(true);
    expect(d.signature).toBe("absente");
    expect(d.editable).toBe("<div>Ma réponse</div>");
    const r = recomposerCorpsBrouillon(d, "<div>Réponse revue</div>", SIG);
    expect(r).toContain(`<div>Réponse revue</div><br>${SIG}<div id="appendonsend">`);
  });

  it("signature réécrite (Outlook) : retrouvée dans le texte, jamais ajoutée en double", () => {
    const html = doc('<p>Bonjour</p><p class="MsoNormal"><b>Julie   MARTIN</b></p><p>Gestionnaire de copropriété, REAL31</p>');
    const d = decouperCorpsBrouillon(html, SIG);
    expect(d.signature).toBe("dans-le-texte");
    expect(recomposerCorpsBrouillon(d, "<p>Bonjour</p>", SIG)).not.toContain("<table");
  });

  // 02/11/2026 (décision Sekou) : signature posée dans Outlook = pas d'éditeur, on finit dans Outlook.
  it("brouillonModifiable : non si la signature a été posée dans Outlook, oui si elle vient de l'intranet ou manque", () => {
    const outlook = doc('<p>Bonjour</p><p class="MsoNormal"><b>Julie MARTIN</b></p><p>Gestionnaire de copropriété, REAL31</p>');
    expect(brouillonModifiable(decouperCorpsBrouillon(outlook, SIG))).toBe(false);
    expect(brouillonModifiable(decouperCorpsBrouillon(doc(`<div>Bonjour</div><br>${SIG}`), SIG))).toBe(true);
    expect(brouillonModifiable(decouperCorpsBrouillon(doc("<div>Bonjour</div>"), SIG))).toBe(true);
    expect(brouillonModifiable(decouperCorpsBrouillon(outlook, null))).toBe(true);
  });

  it("une signature citée dans l'historique ne compte pas pour le nouveau texte", () => {
    const html = doc(`<div>Relance</div><blockquote>Mon précédent mail<br>Julie MARTIN Gestionnaire de copropriété, REAL31</blockquote>`);
    const d = decouperCorpsBrouillon(html, SIG);
    expect(d.signature).toBe("absente");
    expect(d.editable).toBe("<div>Relance</div>");
  });

  it("sans signature connue (pas de clé Signitic) : rien n'est ajouté ; sans <body>, tout est éditable", () => {
    const d = decouperCorpsBrouillon("<p>Texte seul</p>", null);
    expect(d).toMatchObject({ avant: "", editable: "<p>Texte seul</p>", suite: "", apres: "", signature: "absente" });
    expect(recomposerCorpsBrouillon(d, "<p>Autre</p>", null)).toBe("<p>Autre</p>");
  });
});
