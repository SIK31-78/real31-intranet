// SMOKE test manuel : parsing REEL des deux RGD de S0304 (PDF locaux hors repo - R12 :
// jamais copies ici). Aucun reseau. Ne loggue QUE des agregats - JAMAIS de libelle/nom (PII).
//
// Reference Foncia (mesuree sur le RGD reel) : la somme des totaux de postes POSITIFS par
// cle donne 043=84,50 · 080=314,60 · 304=330,00 · 700=41 591,52 (4 postes) · 790=276,24 ;
// pour la cle 001 la mesure historique (78 230,22, 25 postes) RATAIT le poste 001.554 au
// titre replie (103,84) - le total de cle IMPRIME par Foncia (76 152,51) confirme que ce
// poste appartient bien a la cle : 26 postes positifs, 78 334,06. Tous les totaux imprimes
// (postes et cles) doivent se reconcilier a 0.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const DOSSIER = "C:/Users/SekouKOMA/REAL 31/Syndic - ML/S304 - De Gaulle 93";
const RGD_FONCIA = `${DOSSIER}/Mes archives/RGD/RGDD_N_20240701-20250630_projet.pdf`;
const RGD_MATERA = `${DOSSIER}/RGDD - Exercice 2024 - 2025.pdf`;

describe("smoke RGD (reels S0304, lecture seule)", () => {
  it(
    "Foncia : postes par cle, totaux imprimes reconcilies, 0 anomalie",
    async () => {
      const { extraireTextePages } = await import("../pdf-texte");
      const { detecterFormatRgd, parserRgdFoncia } = await import("../parseur-rgd");

      const pages = await extraireTextePages(new Uint8Array(readFileSync(RGD_FONCIA)));
      expect(detecterFormatRgd(pages)).toBe("foncia");
      const res = parserRgdFoncia(pages);

      // Somme des totaux de postes POSITIFS par cle + compte de postes positifs.
      const parCle = new Map<string, { nb: number; somme: number }>();
      for (const c of res.controles) {
        if (c.niveau !== "poste" || c.ttcImprime <= 0) continue;
        const cle = c.code.split(".")[0]!;
        const agg = parCle.get(cle) ?? { nb: 0, somme: 0 };
        agg.nb++;
        agg.somme = Math.round((agg.somme + c.ttcImprime) * 100) / 100;
        parCle.set(cle, agg);
      }
      for (const [cle, agg] of [...parCle.entries()].sort()) {
        console.log(`=== cle ${cle} : ${agg.nb} poste(s) positif(s), ${agg.somme.toFixed(2)}`);
      }
      console.log("=== depenses  :", res.lignes.length);
      console.log("=== controles :", res.controles.length, "| en ecart :", res.controles.filter((c) => Math.abs(c.ecart) >= 0.005).length);
      console.log("=== anomalies :", res.anomalies.length);
      for (const a of res.anomalies.slice(0, 10)) console.log("    anomalie p", a.page, ":", a.texte.slice(0, 90));

      expect(parCle.get("043")).toMatchObject({ nb: 1, somme: 84.5 });
      expect(parCle.get("080")).toMatchObject({ nb: 1, somme: 314.6 });
      expect(parCle.get("304")).toMatchObject({ nb: 1, somme: 330.0 });
      expect(parCle.get("700")).toMatchObject({ nb: 4, somme: 41591.52 });
      expect(parCle.get("790")).toMatchObject({ nb: 1, somme: 276.24 });
      // 26 postes positifs (le 001.554 au titre replie inclus), pas 25.
      expect(parCle.get("001")).toMatchObject({ nb: 26, somme: 78334.06 });
      // Filet : TOUS les totaux imprimes (postes ET cles) se reconcilient a 0.
      expect(res.controles.filter((c) => Math.abs(c.ecart) >= 0.005)).toEqual([]);
      expect(res.controles.filter((c) => c.niveau === "cle")).toHaveLength(6);
      expect(res.anomalies).toEqual([]);
    },
    120_000,
  );

  it(
    "Matera : totaux par compte et total general reconcilies, 0 anomalie",
    async () => {
      const { extraireTextePages } = await import("../pdf-texte");
      const { detecterFormatRgd, parserRgdMatera } = await import("../parseur-rgd");

      const pages = await extraireTextePages(new Uint8Array(readFileSync(RGD_MATERA)));
      expect(detecterFormatRgd(pages)).toBe("matera");
      const res = parserRgdMatera(pages);

      const general = res.controles.find((c) => c.niveau === "general");
      console.log("=== depenses  :", res.lignes.length);
      console.log("=== controles :", res.controles.length, "| en ecart :", res.controles.filter((c) => Math.abs(c.ecart) >= 0.005).length);
      console.log("=== general   :", general?.ttcImprime.toFixed(2), "vs", general?.ttcCalcule.toFixed(2));
      console.log("=== anomalies :", res.anomalies.length);
      for (const a of res.anomalies.slice(0, 10)) console.log("    anomalie p", a.page, ":", a.texte.slice(0, 90));

      // Total general imprime par Matera sur le RGD 2024-2025 de S0304.
      expect(general).toMatchObject({ ttcImprime: 178486.6 });
      expect(res.controles.filter((c) => Math.abs(c.ecart) >= 0.005)).toEqual([]);
      expect(res.anomalies).toEqual([]);
      expect(res.lignes.length).toBeGreaterThan(30);
    },
    120_000,
  );
});
