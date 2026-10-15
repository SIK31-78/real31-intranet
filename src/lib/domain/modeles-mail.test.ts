import { describe, expect, it } from "vitest";
import { modelesPourAgence, variablesInconnues, type ModeleMailStocke } from "./modeles-mail";

const m = (id: string, agence: string | null, actif = true, titre = id): ModeleMailStocke => ({ id, titre, sujet: "", corps: "", agence, actif });

describe("modèles proposés à une agence", () => {
  const liste = [m("cabinet", null, true, "A cabinet"), m("hls", "HLS", true, "Z Houilles"), m("lgc", "LGC"), m("retire", "HLS", false)];

  it("ceux de l'agence d'abord, puis ceux du cabinet, sans les retirés ni les autres agences", () => {
    expect(modelesPourAgence(liste, "hls").map((x) => x.id)).toEqual(["hls", "cabinet"]);
  });

  it("agence inconnue : seulement ceux du cabinet", () => {
    expect(modelesPourAgence(liste, undefined).map((x) => x.id)).toEqual(["cabinet"]);
  });
});

describe("variables inconnues", () => {
  it("signale une variable que la fusion ne connaît pas, une seule fois", () => {
    expect(variablesInconnues("{{copro_nom}} {{ VGenre }} {{VGenre}} {{ Copro_Adresse }}")).toEqual(["VGenre"]);
  });
});
