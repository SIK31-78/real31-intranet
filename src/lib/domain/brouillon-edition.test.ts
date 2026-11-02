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

  // 02/11/2026 : réponse préparée dans Outlook bureau (Windows). L'en-tête du message cité est un
  // <div> à trait supérieur, pas un id reconnaissable : l'historique reste hors de l'éditeur.
  const ORIGINE = '<p class="MsoNormal">Bonjour, la fuite au 3e est revenue.<o:p></o:p></p>';

  it("Outlook bureau FR : l'en-tête « De : » sous le trait ouvre l'historique, gardé tel quel avec son <div> d'enveloppe", () => {
    const html =
      '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0cm}</style></head>\r\n' +
      '<body lang="FR" link="#0563C1"><div class="WordSection1">\r\n' +
      '<p class="MsoNormal">Bonjour Monsieur,<o:p></o:p></p>\r\n<p class="MsoNormal">Le plombier passe jeudi.<o:p></o:p></p>\r\n' +
      '<p class="MsoNormal"><o:p>&nbsp;</o:p></p>\r\n' +
      '<div>\r\n<div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">\r\n' +
      '<p class="MsoNormal"><b><span lang="FR">De&nbsp;:</span></b><span lang="FR"> M. Dupont &lt;dupont@ex.fr&gt;<br>\r\n' +
      '<b>Envoyé&nbsp;:</b> lundi 2 novembre 2026 09:12<br>\r\n<b>À&nbsp;:</b> Syndic 2<br>\r\n<b>Objet&nbsp;:</b> Fuite<o:p></o:p></span></p>\r\n' +
      `</div>\r\n</div>\r\n<p class="MsoNormal"><o:p>&nbsp;</o:p></p>\r\n${ORIGINE}\r\n</div>\r\n</body>\r\n</html>`;
    const d = decouperCorpsBrouillon(html, SIG);
    expect(d.citation).toBe(true);
    expect(d.signature).toBe("absente");
    expect(d.editable).toContain("Le plombier passe jeudi.");
    expect(d.editable).not.toContain("Dupont");
    expect(d.editable.endsWith('<p class="MsoNormal"><o:p>&nbsp;</o:p></p>')).toBe(true);
    expect(d.suite.startsWith('<div><div style="border:none;border-top:solid #E1E1E1 1.0pt;')).toBe(true);
    expect(d.suite).toContain(ORIGINE);
    const r = recomposerCorpsBrouillon(d, "<div>Le plombier passe vendredi.</div>", SIG);
    expect(r).toContain(`<div>Le plombier passe vendredi.</div><br>${SIG}<div><div style="border:none;border-top:solid #E1E1E1`);
    expect(r).toContain(ORIGINE);
  });

  it("Outlook bureau EN (ancien trait #B5C4DF, guillemets simples) : « From: » ouvre aussi l'historique", () => {
    const html = doc(
      "<p class=\"MsoNormal\">Hello,<o:p></o:p></p><p class=\"MsoNormal\">Please find the quote attached.<o:p></o:p></p>" +
        "<div><div style='border:none;border-top:solid #B5C4DF 1.0pt;padding:3.0pt 0cm 0cm 0cm'>" +
        "<p class=\"MsoNormal\"><b><span lang=\"EN-US\">From:</span></b><span lang=\"EN-US\"> John Smith<br><b>Sent:</b> Monday<br><b>Subject:</b> Quote</span></p>" +
        `</div></div>${ORIGINE}`,
    );
    const d = decouperCorpsBrouillon(html, null);
    expect(d.citation).toBe(true);
    expect(d.editable).toBe('<p class="MsoNormal">Hello,<o:p></o:p></p><p class="MsoNormal">Please find the quote attached.<o:p></o:p></p>');
    expect(d.suite.startsWith("<div><div style='border:none;border-top:solid #B5C4DF")).toBe(true);
  });

  it("Outlook : le trait <hr> avant l'en-tête divRplyFwdMsg part avec l'historique ; un trait sans « De : » reste du texte", () => {
    const d = decouperCorpsBrouillon(doc('<div>Bien reçu.</div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><b>From:</b> M. Dupont</div><div>Message</div>'), null);
    expect(d.citation).toBe(true);
    expect(d.editable).toBe("<div>Bien reçu.</div>");
    expect(d.suite.startsWith("<hr ")).toBe(true);

    const encadre = doc('<div style="border:none;border-top:solid #E1E1E1 1.0pt"><p>Ordre du jour :</p></div><p>Suite</p>');
    const e = decouperCorpsBrouillon(encadre, null);
    expect(e.citation).toBe(false);
    expect(e.suite).toBe("");
  });
});
