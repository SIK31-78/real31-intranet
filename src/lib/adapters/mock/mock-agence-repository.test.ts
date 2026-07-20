// Test du lecteur d'agences mock : les 4 agences du cabinet, codes alignes sur la table
// Agency (ML / LGC / HLS / ASN), ids coherents avec le mock des gestionnaires.

import { describe, expect, it } from "vitest";
import { MockAgenceRepository } from "./mock-agence-repository";

describe("MockAgenceRepository", () => {
  it("liste les 4 agences avec leurs codes", async () => {
    const agences = await new MockAgenceRepository().listerAgences();
    expect(agences.map((a) => a.code).sort()).toEqual(["ASN", "HLS", "LGC", "ML"]);
  });

  it("expose l'id technique (pour resoudre agencyId copro / user)", async () => {
    const agences = await new MockAgenceRepository().listerAgences();
    const lgc = agences.find((a) => a.code === "LGC");
    expect(lgc?.id).toBe("agence-lgc");
  });
});
