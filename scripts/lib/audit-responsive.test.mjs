import { describe, expect, it } from "vitest";
import {
  cheminVersRoute,
  classer,
  codeSortie,
  estDynamique,
  nomCapture,
  planifier,
  rapportMarkdown,
  resoudreRoute,
  synthese,
} from "./audit-responsive.mjs";

const mesureVide = {
  largeurVue: 390,
  scrollWidth: 390,
  debordementDocument: false,
  debordants: [],
  nbDebordants: 0,
  largeurNulle: [],
  nbLargeurNulle: 0,
  tronques: [],
  nbTronques: 0,
  tactiles: [],
  nbTactiles: 0,
};

describe("routes", () => {
  it("convertit un chemin de page en route", () => {
    expect(cheminVersRoute("cles/trousseaux/[id]/page.tsx")).toBe("/cles/trousseaux/[id]");
    expect(cheminVersRoute("page.tsx")).toBe("/");
    expect(cheminVersRoute("(app)\\accueil\\page.tsx")).toBe("/accueil");
  });

  it("detecte les routes dynamiques", () => {
    expect(estDynamique("/dossiers/[id]")).toBe(true);
    expect(estDynamique("/dossiers")).toBe(false);
  });

  it("resout une route dynamique seulement si tous les ids sont renseignes", () => {
    const config = { dynamiques: { "/a/[id]/b/[code]": { id: "12", code: "" }, "/c/[id]": { id: " x y " } } };
    expect(resoudreRoute("/statique", config)).toBe("/statique");
    expect(resoudreRoute("/a/[id]/b/[code]", config)).toBeNull();
    expect(resoudreRoute("/c/[id]", config)).toBe("/c/x%20y");
    expect(resoudreRoute("/inconnue/[id]", config)).toBeNull();
  });

  it("planifie : filtre, exclues, dynamiques sans id", () => {
    const routes = ["/accueil", "/dossiers", "/dossiers/[id]", "/dev-login"];
    const config = { dynamiques: { "/dossiers/[id]": { id: "" } }, exclues: { "/dev-login": "effet de bord" } };
    const tout = planifier(routes, config, "");
    expect(tout.aAuditer.map((r) => r.route)).toEqual(["/accueil", "/dossiers"]);
    expect(tout.ignorees.map((r) => r.route)).toEqual(["/dossiers/[id]", "/dev-login"]);
    const filtre = planifier(routes, config, "doss, zzz");
    expect(filtre.aAuditer.map((r) => r.route)).toEqual(["/dossiers"]);
  });

  it("nomme les captures", () => {
    expect(nomCapture("/cles/trousseaux/12?x=1")).toBe("cles-trousseaux-12");
    expect(nomCapture("/")).toBe("racine");
  });
});

describe("classement", () => {
  it("une page propre est ok", () => {
    expect(classer({ route: "/a", chemin: "/a", mesure: mesureVide }).gravite).toBe("ok");
  });

  it("le debordement du document est bloquant", () => {
    const r = classer({
      route: "/a",
      chemin: "/a",
      mesure: { ...mesureVide, scrollWidth: 520, debordementDocument: true, nbDebordants: 1, debordants: [{ selecteur: "table.x", largeur: 520, gauche: 0, droite: 520, depasse: 130, texte: "" }] },
    });
    expect(r.gravite).toBe("bloquant");
    expect(r.constats[0].code).toBe("debordement");
    expect(r.constats[0].message).toContain("+130 px");
  });

  it("un element masque par overflow-x:hidden mais depassant reste bloquant", () => {
    const r = classer({ route: "/a", chemin: "/a", mesure: { ...mesureVide, nbDebordants: 2, debordants: [{ selecteur: "div", largeur: 500, gauche: 0, droite: 500, depasse: 110, texte: "" }] } });
    expect(r.gravite).toBe("bloquant");
  });

  it("la largeur nulle est bloquante (cas du 04/11)", () => {
    const r = classer({ route: "/mes-emails", chemin: "/mes-emails", mesure: { ...mesureVide, nbLargeurNulle: 1, largeurNulle: [{ selecteur: "section.@container", largeur: 0, hauteur: 300, enfants: 3, texte: "" }] } });
    expect(r.gravite).toBe("bloquant");
    expect(r.constats[0].code).toBe("largeur-nulle");
  });

  it("textes tronques : info ; cibles tactiles : info, genant si < 24 px", () => {
    const tronque = classer({ route: "/a", chemin: "/a", mesure: { ...mesureVide, nbTronques: 3, tronques: [{ selecteur: "p", visible: 100, complet: 220, texte: "abc" }] } });
    expect(tronque.gravite).toBe("info");
    const tactile = classer({ route: "/a", chemin: "/a", mesure: { ...mesureVide, nbTactiles: 1, tactiles: [{ selecteur: "button", largeur: 30, hauteur: 28, texte: "" }] } });
    expect(tactile.gravite).toBe("info");
    const minuscule = classer({ route: "/a", chemin: "/a", mesure: { ...mesureVide, nbTactiles: 1, tactiles: [{ selecteur: "button", largeur: 30, hauteur: 16, texte: "" }] } });
    expect(minuscule.gravite).toBe("genant");
  });

  it("la gravite retenue est la pire", () => {
    const r = classer({ route: "/a", chemin: "/a", mesure: { ...mesureVide, nbTronques: 1, tronques: [], nbLargeurNulle: 1, largeurNulle: [] } });
    expect(r.gravite).toBe("bloquant");
  });

  it("HTTP en erreur, redirection vers la connexion, erreur de navigation : non mesuree (genant)", () => {
    expect(classer({ route: "/a", chemin: "/a", statut: 500 }).constats[0].code).toBe("non-mesuree");
    expect(classer({ route: "/a", chemin: "/a", statut: 200, redirigeeVersConnexion: true }).gravite).toBe("genant");
    expect(classer({ route: "/a", chemin: "/a", erreur: "Timeout" }).constats[0].message).toContain("Timeout");
  });
});

describe("code de sortie et rapport", () => {
  const propre = classer({ route: "/ok", chemin: "/ok", mesure: mesureVide });
  const casse = classer({ route: "/casse", chemin: "/casse", mesure: { ...mesureVide, nbLargeurNulle: 1, largeurNulle: [{ selecteur: "section", largeur: 0, hauteur: 200, enfants: 2, texte: "Bonjour" }] } });
  const absente = classer({ route: "/absente", chemin: "/absente", statut: 404 });

  it("codes 0 / 1 / 2", () => {
    expect(codeSortie([propre])).toBe(0);
    expect(codeSortie([propre, casse])).toBe(1);
    expect(codeSortie([propre, absente])).toBe(2);
    expect(codeSortie([casse, absente])).toBe(1);
  });

  it("synthese et rapport classes par gravite", () => {
    expect(synthese([propre, casse, absente])).toEqual({ pages: 3, bloquant: 1, genant: 1, info: 0, ok: 1 });
    const md = rapportMarkdown([propre, absente, casse], {
      largeur: 390,
      base: "http://localhost:3000",
      date: "2026-11-04",
      ignorees: [{ route: "/dossiers/[id]", raison: "sans id" }],
    });
    expect(md.indexOf("`/casse`")).toBeLessThan(md.indexOf("`/absente`"));
    expect(md).toContain("## BLOQUANT (1 page)");
    expect(md).toContain("## Pages ignorées");
    expect(md).toContain("« Bonjour »");
  });
});
