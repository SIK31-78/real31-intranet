import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boiteTri,
  boiteTriConfiguree,
  boiteTriDeLAgence,
  boitesTri,
  debutTri,
  ecritureTriPour,
  envoiMailPour,
  lireBoitesTri,
  recuDepuisDebutTri,
  triAutomatiquePour,
} from "./mail-gate";

// Config des boîtes triées (V2 du tri, 27/10/2026) : MAIL_TRI_BOITES, son repli sur les
// variables d'une seule boîte, et les interrupteurs globaux qui restent des coupe-circuits.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const DEUX_BOITES = JSON.stringify([
  { boite: "Syndic4@real31.fr", agences: ["hls"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: false },
  { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], ecriture: false, automatique: false, envoi: true },
]);

describe("lireBoitesTri (MAIL_TRI_BOITES)", () => {
  it("lit les boîtes, adresses en minuscules, agences en majuscules", () => {
    expect(lireBoitesTri(DEUX_BOITES)).toEqual([
      { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: false },
      { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], depuis: null, ecriture: false, automatique: false, envoi: true },
    ]);
  });

  it("admet la boîte fictive « echantillon »", () => {
    expect(lireBoitesTri('[{"boite":"echantillon","agences":["HLS"],"ecriture":false,"automatique":false,"envoi":false}]')[0]!.boite).toBe("echantillon");
  });

  it("refuse un JSON faux avec un message lisible", () => {
    expect(() => lireBoitesTri("[{boite:")).toThrow("MAIL_TRI_BOITES n'est pas un JSON lisible.");
    expect(() => lireBoitesTri('{"boite":"a@b.fr"}')).toThrow("doit être un tableau");
    expect(() => lireBoitesTri('[{"boite":"pas une adresse","agences":["HLS"],"ecriture":true,"automatique":true,"envoi":true}]')).toThrow(
      "MAIL_TRI_BOITES[0].boite",
    );
    expect(() => lireBoitesTri('[{"boite":"a@b.fr","agences":[],"ecriture":true,"automatique":true,"envoi":true}]')).toThrow(
      "MAIL_TRI_BOITES[0].agences",
    );
    expect(() => lireBoitesTri('[{"boite":"a@b.fr","agences":["HLS"],"depuis":"14/10/2026","ecriture":true,"automatique":true,"envoi":true}]')).toThrow(
      "MAIL_TRI_BOITES[0].depuis",
    );
    expect(() => lireBoitesTri('[{"boite":"a@b.fr","agences":["HLS"],"ecriture":"oui","automatique":true,"envoi":true}]')).toThrow(
      "MAIL_TRI_BOITES[0].ecriture",
    );
  });

  it("refuse une boîte en double et une agence dans deux boîtes", () => {
    const b = (boite: string, agences: string[]) => ({ boite, agences, ecriture: true, automatique: true, envoi: true });
    expect(() => lireBoitesTri(JSON.stringify([b("a@b.fr", ["HLS"]), b("A@b.fr", ["LGC"])]))).toThrow("déjà décrite");
    expect(() => lireBoitesTri(JSON.stringify([b("a@b.fr", ["HLS"]), b("c@b.fr", ["hls"])]))).toThrow("l'agence HLS est déjà triée dans a@b.fr");
  });
});

describe("boitesTri : config, repli et config illisible", () => {
  it("lit MAIL_TRI_BOITES quand elle est posée (les anciennes variables sont ignorées)", () => {
    vi.stubEnv("MAIL_TRI_BOITES", DEUX_BOITES);
    vi.stubEnv("MAIL_BOITE_TRI", "autre@real31.fr");
    expect(boitesTri().map((b) => b.boite)).toEqual(["syndic4@real31.fr", "syndic2@real31.fr"]);
    expect(boiteTri("SYNDIC2@real31.fr")?.agences).toEqual(["LGC", "ASN"]);
    expect(boiteTri("inconnue@real31.fr")).toBeNull();
    expect(boiteTriDeLAgence("asn")?.boite).toBe("syndic2@real31.fr");
    expect(boiteTriDeLAgence("ML")).toBeNull();
    expect(boiteTriConfiguree()).toBe("syndic4@real31.fr");
  });

  it("sans MAIL_TRI_BOITES : une seule boîte, celle des variables d'avant", () => {
    vi.stubEnv("MAIL_TRI_BOITES", "");
    vi.stubEnv("MAIL_BOITE_TRI", " Syndic4@real31.fr ");
    vi.stubEnv("MAIL_TRI_AGENCE", "hls");
    vi.stubEnv("MAIL_TRI_DEPUIS", "2026-10-14");
    expect(boitesTri()).toEqual([
      { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: true },
    ]);
  });

  it("repli : seule syndic4 rangeait seule, comme avant la config", () => {
    vi.stubEnv("MAIL_TRI_BOITES", "");
    vi.stubEnv("MAIL_BOITE_TRI", "test-tri@real31.fr");
    vi.stubEnv("MAIL_TRI_AGENCE", "");
    expect(boitesTri()).toEqual([
      { boite: "test-tri@real31.fr", agences: [], depuis: null, ecriture: true, automatique: false, envoi: true },
    ]);
  });

  it("rien de configuré : aucune boîte", () => {
    vi.stubEnv("MAIL_TRI_BOITES", "");
    vi.stubEnv("MAIL_BOITE_TRI", "");
    expect(boitesTri()).toEqual([]);
    expect(boiteTriConfiguree()).toBeNull();
  });

  it("config illisible : aucune boîte, l'erreur part dans les journaux", () => {
    const erreur = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("MAIL_TRI_BOITES", "[{");
    vi.stubEnv("MAIL_BOITE_TRI", "syndic4@real31.fr");
    expect(boitesTri()).toEqual([]);
    expect(erreur).toHaveBeenCalledWith(expect.stringContaining("MAIL_TRI_BOITES n'est pas un JSON lisible."));
  });
});

describe("debutTri par boîte", () => {
  it("prend la date de la boîte demandée, la première sans boîte", () => {
    vi.stubEnv("MAIL_TRI_BOITES", DEUX_BOITES);
    vi.stubEnv("MAIL_TRI_DEPUIS", "2020-01-01");
    expect(debutTri("syndic4@real31.fr")).toBe("2026-10-13T22:00:00Z");
    expect(debutTri()).toBe("2026-10-13T22:00:00Z");
    expect(debutTri("syndic2@real31.fr")).toBeNull();
    expect(recuDepuisDebutTri("2026-10-01T09:00:00Z", "syndic4@real31.fr")).toBe(false);
    expect(recuDepuisDebutTri("2026-10-01T09:00:00Z", "syndic2@real31.fr")).toBe(true);
  });
});

describe("capacités : interrupteur global ET boîte", () => {
  const config = (p: Partial<{ ecriture: boolean; automatique: boolean; envoi: boolean }>) => ({
    boite: "syndic4@real31.fr",
    agences: ["HLS"],
    depuis: null,
    ecriture: false,
    automatique: false,
    envoi: false,
    ...p,
  });

  it("écriture", () => {
    vi.stubEnv("MAIL_TRI_ECRITURE", "on");
    expect(ecritureTriPour(config({ ecriture: true }))).toBe(true);
    expect(ecritureTriPour(config({ ecriture: false }))).toBe(false);
    expect(ecritureTriPour({ ...config({ ecriture: true }), boite: "echantillon" })).toBe(false);
    expect(ecritureTriPour(null)).toBe(false);
    vi.stubEnv("MAIL_TRI_ECRITURE", "");
    expect(ecritureTriPour(config({ ecriture: true }))).toBe(false);
  });

  it("automatique", () => {
    vi.stubEnv("MAIL_TRI_AUTO", "on");
    expect(triAutomatiquePour(config({ automatique: true }))).toBe(true);
    expect(triAutomatiquePour(config({ automatique: false }))).toBe(false);
    vi.stubEnv("MAIL_TRI_AUTO", "off");
    expect(triAutomatiquePour(config({ automatique: true }))).toBe(false);
  });

  it("envoi : boîte de la config seulement", () => {
    vi.stubEnv("MAIL_TRI_BOITES", DEUX_BOITES);
    vi.stubEnv("MAIL_ENVOI", "on");
    expect(envoiMailPour("syndic2@real31.fr")).toBe(true);
    expect(envoiMailPour("syndic4@real31.fr")).toBe(false);
    expect(envoiMailPour("inconnue@real31.fr")).toBe(false);
    vi.stubEnv("MAIL_ENVOI", "");
    expect(envoiMailPour("syndic2@real31.fr")).toBe(false);
  });
});
