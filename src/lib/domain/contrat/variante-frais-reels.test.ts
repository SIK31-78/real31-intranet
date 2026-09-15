// Frais postaux au REEL (patron, 15/09/2026) : trois phrases du § 7.1.5 changent, et
// rien d'autre. Verrouille contre le gabarit reel, pas contre une fixture.

import { describe, expect, it } from "vitest";
import { GABARIT_DROITE, GABARIT_GAUCHE, GABARIT_PLEINE_LARGEUR } from "./gabarit-contrat";
import { remplirTexte, varianteFraisReels } from "./remplir-gabarit";

const TOUT = [...GABARIT_PLEINE_LARGEUR, ...GABARIT_GAUCHE, ...GABARIT_DROITE]
  .flatMap((b) => (typeof b === "string" ? [b] : b))
  .join("\n");

describe("varianteFraisReels", () => {
  const reel = varianteFraisReels(TOUT);

  it("retire le forfait de frais postaux de la remuneration", () => {
    expect(TOUT).toContain("plus frais postaux de [FormulaireContratSyndic.FraisPostaux] €");
    expect(reel).not.toContain("plus frais postaux");
    expect(reel).not.toContain("[FormulaireContratSyndic.FraisPostaux]");
    expect(reel).toContain("€ toutes taxes comprises. Cette rémunération est payable trimestriellement d’avance.");
  });

  it("retire la reduction du forfait (LRE, appels de fonds par mail)", () => {
    expect(TOUT).toContain("Le forfait de frais postaux est réduit de 10 €");
    expect(reel).not.toContain("Le forfait de frais postaux est réduit");
  });

  it("retourne la phrase du remboursement : l'envoi DONNE lieu a remboursement", () => {
    expect(reel).toContain(
      "L’envoi des documents afférents aux prestations du forfait donne lieu à remboursement au syndic des frais d’affranchissement ou d’acheminement engagés.",
    );
    expect(reel).not.toContain("ne donne pas lieu à remboursement au syndic des frais d’affranchissement");
  });

  it("ne touche a rien d'autre : les prestations particulieres restent frais d'envoi compris", () => {
    expect(reel).toContain("ne donne lieu à aucun remboursement au syndic des frais d’affranchissement ou d’acheminement engagés qui sont inclus dans la rémunération forfaitaire");
    // 3 remplacements, dont un qui raccourcit : le texte perd des caracteres, jamais n'en gagne.
    expect(reel.length).toBeLessThan(TOUT.length);
    expect(TOUT.length - reel.length).toBeLessThan(400);
  });

  it("remplirTexte applique la variante avant les placeholders, et seulement sur demande", () => {
    const table = { "[FormulaireContratSyndic.FraisPostaux]": "566", "[HonoGestionHT]": "1", "[FormulaireContratSyndic.HonoGestion]": "1" };
    const bloc = GABARIT_GAUCHE.find((b) => typeof b === "string" && b.includes("plus frais postaux")) as string;
    expect(remplirTexte(bloc, table)).toContain("plus frais postaux de 566 €");
    expect(remplirTexte(bloc, table, { fraisPostauxReels: true })).not.toContain("566");
  });
});
