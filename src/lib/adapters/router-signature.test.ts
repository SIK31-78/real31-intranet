// Le repli de signature depend du CONTEXTE d'envoi (incident Sekou 2026-07-28 : une
// signature de demonstration est partie dans un vrai mail au conseil syndical).
//
// Regle verrouillee ici : sans cle Signitic, un envoi REEL ne recoit AUCUNE signature ;
// seul le mode dev (aucun mail ne part) a droit a la signature de demo.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getSignatureProvider } from "./router";

const ENV = { ...process.env };
beforeEach(() => {
  delete process.env.SIGNITIC_API_KEY;
  delete process.env.MAIL_SOURCE;
});
afterEach(() => {
  process.env = { ...ENV };
});

describe("getSignatureProvider — repli sans clé Signitic", () => {
  it("ne sert JAMAIS la signature de démo quand le mail réel est branché", async () => {
    process.env.MAIL_SOURCE = "graph";
    const html = await getSignatureProvider().getSignatureHtml("sekou.koma@real31.fr");
    expect(html).toBeNull();
  });

  it("sert la signature de démo en dev, où aucun mail ne part", async () => {
    const html = await getSignatureProvider().getSignatureHtml("sekou.koma@real31.fr");
    expect(html).toContain("REAL31");
  });

  it("passe sur le vrai provider dès que la clé est présente, mail réel ou non", () => {
    process.env.SIGNITIC_API_KEY = "k";
    const sansMail = getSignatureProvider().constructor.name;
    process.env.MAIL_SOURCE = "graph";
    expect(getSignatureProvider().constructor.name).toBe(sansMail);
    expect(sansMail).toBe("SigniticSignatureProvider");
  });
});
