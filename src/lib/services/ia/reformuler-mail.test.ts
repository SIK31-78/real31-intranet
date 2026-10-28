// Service de reformulation : provider et journal doublés (aucun réseau, aucune base). On vérifie
// que le texte d'origine n'est jamais perdu, que les sorties douteuses sont écartées, que le
// journal compte sans jamais garder le texte, et le plafond quotidien.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DemandeReformulation, ReformulationProvider, ReponseReformulation } from "@/lib/ports/reformulation-provider";
import { ErreurReformulation } from "@/lib/ports/reformulation-provider";
import type { IaUsageRepository, LigneUsageIa } from "@/lib/ports/ia-usage-repository";

const etat = vi.hoisted(() => ({
  lignes: [] as LigneUsageIa[],
  journalAbsent: false,
  journalEnPanne: false,
  provider: null as ReformulationProvider | null,
}));

vi.mock("@/lib/adapters/router", () => ({
  getReformulationProvider: () => etat.provider,
  getIaUsageRepository: (): IaUsageRepository => ({
    enregistrer: async (l) => {
      if (etat.journalEnPanne) throw new Error("PGRST500 panne");
      etat.lignes.push(l);
    },
    compterDuJour: async (id, fonction, jour) =>
      etat.journalAbsent ? null : etat.lignes.filter((l) => l.gestionnaireId === id && l.fonction === fonction && l.jour === jour).length,
  }),
}));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));

import { reformulerMail, reformulationDisponible } from "./reformuler-mail";

const QUI = { id: "g1", initiales: "SK", incarnation: false };
const TEXTE = "bonjour madame, le plombier passe le 12/11 a 9h pour la fuite. cordialement";
const MAINTENANT = new Date("2026-10-28T10:00:00Z");

function provider(reponse: Partial<ReponseReformulation> | Error, appels: DemandeReformulation[] = []): ReformulationProvider {
  return {
    nom: "test",
    reformuler: async (d) => {
      appels.push(d);
      if (reponse instanceof Error) throw reponse;
      return { texte: "", fin: "termine", tokensEntree: 1300, tokensSortie: 120, modele: "claude-sonnet-5-5", ...reponse };
    },
  };
}

beforeEach(() => {
  etat.lignes.length = 0;
  etat.journalAbsent = false;
  etat.journalEnPanne = false;
  etat.provider = null;
  vi.unstubAllEnvs();
});

describe("reformulerMail", () => {
  it("interrupteur coupé : pas de bouton, refus explicite, aucun appel", async () => {
    expect(reformulationDisponible()).toBe(false);
    expect(await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" })).toEqual({ ok: false, message: "La reformulation n'est pas activée." });
    expect(etat.lignes).toHaveLength(0);
  });

  it("rend le texte nettoyé et journalise sans le texte", async () => {
    const appels: DemandeReformulation[] = [];
    const p = provider({ texte: "Bonjour Madame,\n\nLe plombier passe le 12/11 à 9h pour la fuite — merci.\n\nCordialement" }, appels);
    const r = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse", objet: "Re: Fuite" }, { provider: p, maintenant: MAINTENANT });
    expect(r).toEqual({ ok: true, texte: "Bonjour Madame,\n\nLe plombier passe le 12/11 à 9h pour la fuite, merci.\n\nCordialement", inchange: false });
    // Le message envoyé : le brouillon encapsulé, l'objet, le modèle par défaut.
    expect(appels[0]?.message).toContain(`<brouillon>\n${TEXTE}\n</brouillon>`);
    expect(appels[0]?.modele).toBe("claude-sonnet-5-5");
    expect(appels[0]?.delaiMs).toBe(20_000);
    expect(etat.lignes).toHaveLength(1);
    const l = etat.lignes[0]!;
    expect(l).toMatchObject({ fonction: "reformulation", gestionnaireId: "g1", initiales: "SK", succes: true, erreur: null, jour: "2026-10-28", tokensEntree: 1300, tokensSortie: 120 });
    expect(l.coutEstime).toBeCloseTo(0.0038, 4);
    expect(JSON.stringify(l)).not.toMatch(/plombier|Madame/);
  });

  it("le modèle se règle par IA_MODELE_REFORMULATION", async () => {
    vi.stubEnv("IA_MODELE_REFORMULATION", "claude-opus-5-5");
    const appels: DemandeReformulation[] = [];
    await reformulerMail(QUI, { texte: TEXTE, nature: "nouveau" }, { provider: provider({ texte: TEXTE }, appels), maintenant: MAINTENANT });
    expect(appels[0]?.modele).toBe("claude-opus-5-5");
  });

  it("texte trop court ou trop long : refusé avant tout appel", async () => {
    const appels: DemandeReformulation[] = [];
    const p = provider({ texte: "x" }, appels);
    expect((await reformulerMail(QUI, { texte: "merci", nature: "reponse" }, { provider: p })).ok).toBe(false);
    const long = await reformulerMail(QUI, { texte: "a".repeat(6001), nature: "reponse" }, { provider: p });
    expect(long).toEqual({ ok: false, message: expect.stringContaining("trop long") });
    expect(appels).toHaveLength(0);
  });

  it("sortie hors sujet : écartée, texte intact, journalisée en échec", async () => {
    const r = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider({ texte: "Je ne peux pas faire cela." }), maintenant: MAINTENANT });
    expect(r).toEqual({ ok: false, message: expect.stringContaining("votre texte est intact") });
    expect(etat.lignes[0]).toMatchObject({ succes: false, erreur: "controle:hors_sujet" });
  });

  it("sortie qui invente un chiffre : écartée", async () => {
    const r = await reformulerMail(
      QUI,
      { texte: TEXTE, nature: "reponse" },
      { provider: provider({ texte: "Bonjour Madame, le plombier passe le 12/11 à 9h pour la fuite, devis de 300 €. Cordialement" }), maintenant: MAINTENANT },
    );
    expect(r.ok).toBe(false);
    expect(etat.lignes[0]?.erreur).toBe("controle:chiffres_ajoutes");
  });

  it("sortie coupée (max_tokens) ou refus du modèle : message d'échec", async () => {
    for (const fin of ["coupe", "refus"] as const) {
      const r = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider({ texte: "Bonjour", fin }), maintenant: MAINTENANT });
      expect(r).toEqual({ ok: false, message: "La reformulation n'a pas pu se faire, votre texte est intact." });
    }
    expect(etat.lignes.map((l) => l.erreur)).toEqual(["coupe", "refus"]);
  });

  it("erreur de l'API : message lisible selon le code, journalisée sans tokens", async () => {
    const r = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider(new ErreurReformulation("delai", "x")), maintenant: MAINTENANT });
    expect(r).toEqual({ ok: false, message: expect.stringContaining("trop de temps") });
    const c = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider(new ErreurReformulation("credit", "x")), maintenant: MAINTENANT });
    expect(c).toEqual({ ok: false, message: expect.stringContaining("crédit IA épuisé") });
    expect(etat.lignes.map((l) => [l.erreur, l.tokensEntree, l.succes])).toEqual([
      ["delai", 0, false],
      ["credit", 0, false],
    ]);
  });

  it("texte déjà correct : signalé inchangé", async () => {
    const propre = "Bonjour Madame, le plombier passe le 12/11 à 9h pour la fuite. Cordialement";
    const r = await reformulerMail(QUI, { texte: propre, nature: "reponse" }, { provider: provider({ texte: propre }), maintenant: MAINTENANT });
    expect(r).toEqual({ ok: true, texte: propre, inchange: true });
  });

  it("plafond quotidien atteint : refus sans appel", async () => {
    vi.stubEnv("IA_REFORMULATION_PLAFOND_JOUR", "2");
    const appels: DemandeReformulation[] = [];
    const p = provider({ texte: TEXTE }, appels);
    await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: p, maintenant: MAINTENANT });
    await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: p, maintenant: MAINTENANT });
    const r = await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: p, maintenant: MAINTENANT });
    expect(r).toEqual({ ok: false, message: expect.stringContaining("plafond de 2 reformulations") });
    expect(appels).toHaveLength(2);
    // Un collègue n'est pas concerné, ni le lendemain.
    expect((await reformulerMail({ ...QUI, id: "g2" }, { texte: TEXTE, nature: "reponse" }, { provider: p, maintenant: MAINTENANT })).ok).toBe(true);
    expect((await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: p, maintenant: new Date("2026-10-29T08:00:00Z") })).ok).toBe(true);
  });

  it("journal absent (SQL pas passé) ou en panne : la reformulation marche quand même", async () => {
    etat.journalAbsent = true;
    expect((await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider({ texte: TEXTE }), maintenant: MAINTENANT })).ok).toBe(true);
    etat.journalEnPanne = true;
    expect((await reformulerMail(QUI, { texte: TEXTE, nature: "reponse" }, { provider: provider({ texte: TEXTE }), maintenant: MAINTENANT })).ok).toBe(true);
  });

  it("note l'incarnation dans le journal", async () => {
    await reformulerMail({ ...QUI, incarnation: true }, { texte: TEXTE, nature: "reponse" }, { provider: provider({ texte: TEXTE }), maintenant: MAINTENANT });
    expect(etat.lignes[0]?.incarnation).toBe(true);
  });
});
