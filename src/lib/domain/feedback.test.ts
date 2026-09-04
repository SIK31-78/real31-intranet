// Tests du domaine feedback : transitions (valides / invalides), ecart exige une raison,
// tri de triage, et surtout la PROJECTION PUBLIQUE (n'expose aucun champ interne). Offline.

import * as fns from "./feedback";
import { describe, expect, it } from "vitest";
import {
  titreParDefaut,
  trierTriage,
  verifierTransition,
  versEntreePublique,
  estStatutPublic,
  type Feedback,
} from "./feedback";

const BASE: Feedback = {
  id: "f1",
  type: "bug",
  titre: "Titre",
  description: "Description interne détaillée",
  page: "/copropriete/S104",
  auteurEmail: "sekou.koma@real31.fr",
  auteurInitiales: "SK",
  severite: "genant",
  statut: "nouveau",
  noteInterne: "note privée de Sekou",
  createdAt: "2026-07-23T10:00:00.000Z",
};

describe("transitions de statut", () => {
  it("autorise les transitions du cycle de vie", () => {
    expect(verifierTransition("nouveau", "prevu")).toEqual({ ok: true });
    expect(verifierTransition("nouveau", "en_cours")).toEqual({ ok: true });
    expect(verifierTransition("prevu", "en_cours")).toEqual({ ok: true });
    expect(verifierTransition("en_cours", "livre")).toEqual({ ok: true });
  });

  it("refuse les transitions hors cycle (dont les etats terminaux)", () => {
    // livre ne s'atteint QUE depuis en_cours.
    expect(verifierTransition("nouveau", "livre")).toEqual({ ok: false, refus: "transition_interdite" });
    expect(verifierTransition("prevu", "livre")).toEqual({ ok: false, refus: "transition_interdite" });
    // terminaux : plus aucune sortie.
    expect(verifierTransition("livre", "en_cours")).toEqual({ ok: false, refus: "transition_interdite" });
    expect(verifierTransition("ecarte", "prevu")).toEqual({ ok: false, refus: "transition_interdite" });
  });

  it("passer a ecarte EXIGE une raison non vide", () => {
    expect(verifierTransition("nouveau", "ecarte")).toEqual({ ok: false, refus: "raison_ecart_requise" });
    expect(verifierTransition("nouveau", "ecarte", { raisonEcart: "   " })).toEqual({
      ok: false,
      refus: "raison_ecart_requise",
    });
    expect(verifierTransition("nouveau", "ecarte", { raisonEcart: "doublon" })).toEqual({ ok: true });
  });
});

describe("tri de triage", () => {
  it("le plus grave d'abord, puis le plus recent d'abord", () => {
    const bloquantVieux: Feedback = { ...BASE, id: "a", severite: "bloquant", createdAt: "2026-07-01T00:00:00Z" };
    const confortRecent: Feedback = { ...BASE, id: "b", severite: "confort", createdAt: "2026-07-22T00:00:00Z" };
    const genantVieux: Feedback = { ...BASE, id: "c", severite: "genant", createdAt: "2026-07-02T00:00:00Z" };
    const genantRecent: Feedback = { ...BASE, id: "d", severite: "genant", createdAt: "2026-07-20T00:00:00Z" };
    const trie = [confortRecent, genantVieux, bloquantVieux, genantRecent].sort(trierTriage).map((f) => f.id);
    expect(trie).toEqual(["a", "d", "c", "b"]);
  });
});

describe("projection publique (garde-fou PII)", () => {
  it("ne garde QUE type / titre / statut / livreAt", () => {
    const livre: Feedback = { ...BASE, statut: "livre", livreAt: "2026-07-23T12:00:00.000Z" };
    const pub = versEntreePublique(livre);
    expect(pub).toEqual({
      type: "bug",
      titre: "Titre",
      statut: "livre",
      livreAt: "2026-07-23T12:00:00.000Z",
    });
  });

  it("n'expose NI auteur, NI description, NI note interne, NI raison d'ecart", () => {
    const ecarte: Feedback = { ...BASE, statut: "ecarte", raisonEcart: "hors périmètre" };
    const pub = versEntreePublique(ecarte) as unknown as Record<string, unknown>;
    expect(pub.auteurEmail).toBeUndefined();
    expect(pub.auteurInitiales).toBeUndefined();
    expect(pub.description).toBeUndefined();
    expect(pub.noteInterne).toBeUndefined();
    expect(pub.raisonEcart).toBeUndefined();
    expect(pub.page).toBeUndefined();
    // Aucune valeur interne ne fuit non plus par serialisation.
    const json = JSON.stringify(pub);
    expect(json).not.toContain("real31.fr");
    expect(json).not.toContain("interne");
    expect(json).not.toContain("privée");
  });

  it("livreAt absent -> clef omise (pas de null)", () => {
    expect(versEntreePublique({ ...BASE, statut: "prevu" })).toEqual({
      type: "bug",
      titre: "Titre",
      statut: "prevu",
    });
  });
});

describe("statuts publics", () => {
  it("prevu / en_cours / livre sont publics ; nouveau / ecarte ne le sont pas", () => {
    expect(estStatutPublic("prevu")).toBe(true);
    expect(estStatutPublic("en_cours")).toBe(true);
    expect(estStatutPublic("livre")).toBe(true);
    expect(estStatutPublic("nouveau")).toBe(false);
    expect(estStatutPublic("ecarte")).toBe(false);
  });
});

describe("titre par defaut", () => {
  it("condense la description et coupe proprement au-dela de la limite", () => {
    expect(titreParDefaut("  Le bouton   ne marche pas  ")).toBe("Le bouton ne marche pas");
    const long = "x".repeat(200);
    const titre = titreParDefaut(long);
    expect(titre.length).toBeLessThanOrEqual(80);
    expect(titre.endsWith("…")).toBe(true);
  });
});

describe("application concernee (multi-outils)", () => {
  it("real31 : le pathname passe tel quel (retro-compatible avec tout l'historique)", () => {
    const { encoderPageFeedback, decoderPageFeedback } = fns;
    expect(encoderPageFeedback("real31", "/copropriete/S104")).toBe("/copropriete/S104");
    expect(decoderPageFeedback("/copropriete/S104")).toEqual({ application: "real31", lien: "/copropriete/S104" });
    expect(decoderPageFeedback(undefined)).toEqual({ application: "real31" });
  });

  it("autre application : prefixe 'app:lien', lien facultatif", () => {
    const { encoderPageFeedback, decoderPageFeedback } = fns;
    expect(encoderPageFeedback("estale", "https://app.estale.fr/x")).toBe("estale:https://app.estale.fr/x");
    expect(decoderPageFeedback("estale:https://app.estale.fr/x")).toEqual({
      application: "estale",
      lien: "https://app.estale.fr/x",
    });
    expect(decoderPageFeedback("registre-contrats:")).toEqual({ application: "registre-contrats" });
    expect(encoderPageFeedback("autre")).toBe("autre:");
  });

  it("un pathname real31 contenant un ':' ne se fait pas voler par le decodeur", () => {
    const { decoderPageFeedback } = fns;
    expect(decoderPageFeedback("/odj/S273__2026-10-14")).toEqual({
      application: "real31",
      lien: "/odj/S273__2026-10-14",
    });
  });
});
