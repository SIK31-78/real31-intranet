import { afterEach, describe, expect, it, vi } from "vitest";
import {
  boiteDestinationBascule,
  boiteTri,
  boiteTriConfiguree,
  boiteTriDeLAgence,
  boitesDestinationBascule,
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
      { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: false, tri: true },
      { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], depuis: null, ecriture: false, automatique: false, envoi: true, tri: true },
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

// Boîte « destination seulement » (ADR-050, 28/10/2026) : syndic1 reçoit les mails de ML par
// bascule, mais l'intranet ne la trie pas (l'équipe ML travaille sous Crypto).
const AVEC_ML = JSON.stringify([
  { boite: "syndic4@real31.fr", agences: ["HLS"], depuis: "2026-10-14", ecriture: true, automatique: true, envoi: true },
  { boite: "syndic2@real31.fr", agences: ["LGC", "ASN"], depuis: "2026-10-27", ecriture: true, automatique: true, envoi: true },
  { boite: "syndic1@real31.fr", agences: ["ML"], tri: false, ecriture: true },
]);

describe("boîte « destination seulement » (tri:false)", () => {
  it("se lit avec automatique et envoi facultatifs (false), tri absent = true", () => {
    const lues = lireBoitesTri(AVEC_ML);
    expect(lues.map((b) => b.tri)).toEqual([true, true, false]);
    expect(lues[2]).toEqual({ boite: "syndic1@real31.fr", agences: ["ML"], depuis: null, ecriture: true, automatique: false, envoi: false, tri: false });
  });

  it("refuse un drapeau tri illisible, automatique ou envoi à true, la boîte échantillon non triée", () => {
    const d = (o: Record<string, unknown>) => JSON.stringify([{ boite: "syndic1@real31.fr", agences: ["ML"], ecriture: true, ...o }]);
    expect(() => lireBoitesTri(d({ tri: "non" }))).toThrow("MAIL_TRI_BOITES[0].tri doit valoir true ou false");
    expect(() => lireBoitesTri(d({ tri: false, automatique: true }))).toThrow("MAIL_TRI_BOITES[0].automatique : une boîte non triée");
    expect(() => lireBoitesTri(d({ tri: false, envoi: true }))).toThrow("MAIL_TRI_BOITES[0].envoi : une boîte non triée");
    expect(() => lireBoitesTri(d({ tri: false, ecriture: undefined }))).toThrow("MAIL_TRI_BOITES[0].ecriture");
    expect(() => lireBoitesTri(d({ tri: false, automatique: false, envoi: false }))).not.toThrow();
    // Une boîte triée garde ses trois champs obligatoires.
    expect(() => lireBoitesTri(d({ tri: true }))).toThrow("MAIL_TRI_BOITES[0].automatique doit valoir true ou false.");
    expect(() =>
      lireBoitesTri(JSON.stringify([{ boite: "echantillon", agences: ["ML"], tri: false, ecriture: false }])),
    ).toThrow("forcément triée");
  });

  it("une agence reste dans UNE seule boîte, triée ou non", () => {
    const b = (boite: string, agences: string[], tri: boolean) => ({ boite, agences, tri, ecriture: true, automatique: false, envoi: false });
    expect(() => lireBoitesTri(JSON.stringify([b("syndic4@real31.fr", ["HLS", "ML"], true), b("syndic1@real31.fr", ["ML"], false)]))).toThrow(
      "l'agence ML est déjà triée dans syndic4@real31.fr",
    );
    expect(() => lireBoitesTri(JSON.stringify([b("syndic1@real31.fr", ["ML"], false), b("syndic1@real31.fr", ["HLS"], true)]))).toThrow("déjà décrite");
  });

  it("n'apparaît dans AUCUNE liste ni recherche de boîtes triées", () => {
    vi.stubEnv("MAIL_TRI_BOITES", AVEC_ML);
    vi.stubEnv("MAIL_TRI_ECRITURE", "on");
    vi.stubEnv("MAIL_TRI_AUTO", "on");
    vi.stubEnv("MAIL_ENVOI", "on");
    expect(boitesTri().map((b) => b.boite)).toEqual(["syndic4@real31.fr", "syndic2@real31.fr"]);
    // Le drapeau ne fuit pas : une BoiteTriConfig est toujours triée.
    expect(boitesTri().every((b) => !("tri" in b))).toBe(true);
    expect(boiteTri("syndic1@real31.fr")).toBeNull();
    expect(boiteTri("SYNDIC1@real31.fr")).toBeNull();
    expect(boiteTriDeLAgence("ML")).toBeNull();
    expect(boiteTriConfiguree()).toBe("syndic4@real31.fr");
    expect(envoiMailPour("syndic1@real31.fr")).toBe(false);
    expect(debutTri("syndic1@real31.fr")).toBeNull();
    expect(triAutomatiquePour(boiteTri("syndic1@real31.fr"))).toBe(false);
  });

  it("même placée en PREMIER dans la config, elle ne devient pas la boîte par défaut", () => {
    vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([...JSON.parse(AVEC_ML)].reverse()));
    expect(boitesTri()[0]!.boite).toBe("syndic2@real31.fr");
    expect(boiteTriConfiguree()).toBe("syndic2@real31.fr");
    expect(debutTri()).toBe("2026-10-26T23:00:00Z");
  });

  it("est une destination de bascule, avec les boîtes triées", () => {
    vi.stubEnv("MAIL_TRI_BOITES", AVEC_ML);
    vi.stubEnv("MAIL_TRI_ECRITURE", "on");
    expect(boitesDestinationBascule().map((b) => [b.boite, b.tri])).toEqual([
      ["syndic4@real31.fr", true],
      ["syndic2@real31.fr", true],
      ["syndic1@real31.fr", false],
    ]);
    const s1 = boiteDestinationBascule(" Syndic1@real31.fr ");
    expect(s1).toMatchObject({ boite: "syndic1@real31.fr", agences: ["ML"], tri: false });
    expect(ecritureTriPour(s1)).toBe(true);
    expect(boiteDestinationBascule("inconnue@real31.fr")).toBeNull();
  });

  it("repli sans MAIL_TRI_BOITES : la boîte unique est triée", () => {
    vi.stubEnv("MAIL_TRI_BOITES", "");
    vi.stubEnv("MAIL_BOITE_TRI", "syndic4@real31.fr");
    expect(boitesDestinationBascule()).toEqual([expect.objectContaining({ boite: "syndic4@real31.fr", tri: true })]);
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
