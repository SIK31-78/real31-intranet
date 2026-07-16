// SMOKE test manuel (non committe, a supprimer apres) : mapping REEL des comptes source du grand
// livre S0302 vers eStale. LECTURE SEULE (aucune ecriture, aucune mutation). Ne loggue QUE des
// AGREGATS (compteurs par statut, nb warnings/erreurs, pretAImporter) - JAMAIS de nom/intitule (PII).
//
// Extraction via la couche texte (positions) pour disposer des INTITULES d'en-tete de compte
// (indispensables a l'appariement par nom). Cible eStale resolue par CODE via me{...} elargi
// multi-agence (S0302 = agence de Houilles). On lance aussi S0305 (copro test injectee) pour
// valider la mecanique meme si S0302 est hors perimetre des droits.
import { readFileSync } from "node:fs";
import { describe, it, beforeAll } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i);
    if (!process.env[k]) process.env[k] = s.slice(i + 1);
  }
});

describe("smoke mapping (reel, lecture seule, aucune ecriture)", () => {
  it(
    "extrait le grand livre puis construit le plan de mapping pour S0302 et S0305",
    async () => {
      const { MistralComptaExtractionProvider } = await import(
        "@/lib/reprise/adapters/compta-extraction/mistral-provider"
      );
      const { ReelEstaleComptaLectureProvider } = await import(
        "@/lib/reprise/adapters/estale-compta/reel-provider"
      );
      const { construirePlanMapping } = await import("../mapping-compta");
      const { estaleConfigure } = await import("@/lib/adapters/estale/client");

      const chemin = "C:/Users/SekouKOMA/projects/real31-intranet/data/GRAND_LIVRE_20251001-20260930.pdf";
      const doc = { nom: "grand-livre.pdf", contenu: new Uint8Array(readFileSync(chemin)) };

      // Extraction couche texte (gratuite, offline) -> intitules d'en-tete disponibles.
      const jeu = await new MistralComptaExtractionProvider().extraireGrandLivre([doc]);
      const distincts = new Set(jeu.lignes.map((l) => l.compte));
      const nbIntitules = Object.keys(jeu.intitules ?? {}).length;
      console.log("=== extraction ===");
      console.log("nb ecritures :", jeu.lignes.length, "| comptes distincts :", distincts.size, "| intitules captures :", nbIntitules);
      console.log("eStale configure :", estaleConfigure());

      const provider = new ReelEstaleComptaLectureProvider();
      for (const code of ["S0302", "S0305"]) {
        console.log(`\n=== mapping ${code} ===`);
        const r = await construirePlanMapping(jeu, code, provider);
        if (!r.ok) {
          console.log("resolution eStale :", r.message);
          continue;
        }
        const c = r.plan.compteurs;
        console.log("condoID resolu, referentiel lu.");
        console.log(
          `statuts : mappe=${c.mappe} action_requise=${c.action_requise} warning=${c.warning_appariement} bloc_b=${c.reporte_bloc_b} bloc_c=${c.reporte_bloc_c} non_mappe=${c.non_mappe}`,
        );
        // Ventilation categorie x statut (PII-free) pour situer warnings/erreurs.
        const parCatStatut = new Map<string, number>();
        for (const e of r.plan.entrees) {
          const k = `${e.categorie}/${e.statut}`;
          parCatStatut.set(k, (parCatStatut.get(k) ?? 0) + 1);
        }
        console.log("ventilation :", [...parCatStatut.entries()].map(([k, n]) => `${k}=${n}`).join(" "));
        console.log(`erreurs=${r.plan.erreurs.length} warnings=${r.plan.warnings.length} pretAImporter=${r.plan.pretAImporter}`);
      }
    },
    900_000,
  );
});
