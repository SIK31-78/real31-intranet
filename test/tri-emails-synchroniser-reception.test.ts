// Index de la reception (REA-419) : application du delta, budget depasse puis reprise,
// relecture complete qui sort les mails disparus, repli quand la table n'existe pas.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { IndexReceptionAbsent, type ReceptionIndex } from "@/lib/ports/reception-index";
import type { OptionsDelta, ReceptionDeltaProvider, ResultatDelta } from "@/lib/ports/reception-delta";
import { MemoireReceptionIndex } from "@/lib/adapters/mock/memoire-reception-index";

const lireRecents = vi.fn();
vi.mock("@/lib/adapters/router", () => ({
  getIngestionTri: () => ({ lireRecents }),
  getReceptionIndex: () => {
    throw new Error("l'index se passe en parametre dans ces tests");
  },
  getReceptionDelta: () => {
    throw new Error("le delta se passe en parametre dans ces tests");
  },
}));
vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));

import { compterDansLIndex, lireReception, marquerRemis, marquerSortis, purgerSortis, synchroniserReception } from "@/lib/services/tri-emails/synchroniser-reception";

const BOITE = "syndic2@real31.fr";

const mail = (n: number, jour = 20): RawMail => ({
  id: `g${n}`,
  internetMessageId: `<m${n}@exemple.fr>`,
  from: `x${n}@exemple.fr`,
  to: [BOITE],
  subject: `Objet ${n}`,
  receivedAt: `2026-10-${String(jour).padStart(2, "0")}T08:${String(n).padStart(2, "0")}:00Z`,
  bodyText: `Corps ${n}`,
  copro: "",
  attachments: [],
});

/** Un faux delta : chaque appel rend la reponse suivante et garde les options recues. */
function deltaFictif(reponses: Partial<ResultatDelta>[]) {
  const recus: OptionsDelta[] = [];
  const delta: ReceptionDeltaProvider = {
    lireDelta: vi.fn(async (_b: string, o: OptionsDelta) => {
      recus.push(o);
      const r = reponses.shift();
      if (!r) throw new Error("appel en trop");
      return { ajoutes: [], retires: [], pages: 1, jeton: "j", complet: true, reinitialise: false, ...r };
    }),
  };
  return { delta, recus };
}

/** Horloge qu'on avance a la main. */
function horloge(debut = Date.parse("2026-10-27T10:00:00Z")) {
  let t = debut;
  return { maintenant: () => t, avancer: (ms: number) => (t += ms) };
}

beforeEach(() => {
  vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([{ boite: BOITE, agences: ["LGC"], depuis: "2026-10-05", ecriture: true, automatique: false, envoi: false }]));
});
afterEach(() => {
  vi.unstubAllEnvs();
  lireRecents.mockReset();
});

describe("synchroniserReception", () => {
  it("premier passage : remplit l'index, garde le deltaLink, un second passage n'ajoute rien", async () => {
    const h = horloge();
    const index = new MemoireReceptionIndex(h.maintenant);
    const { delta, recus } = deltaFictif([{ ajoutes: [mail(1), mail(2)], jeton: "delta-1", pages: 2 }, { jeton: "delta-2" }]);

    const b1 = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta, maintenant: h.maintenant });
    expect(b1).toMatchObject({ indexDisponible: true, ajoutes: 2, retires: 0, pages: 2, complet: true, nonRevus: 0 });
    expect(recus[0]).toMatchObject({ jeton: null, depuis: "2026-10-04T22:00:00Z", budgetMs: 20_000 });
    expect(b1.presents).toEqual(new Map([["<m1@exemple.fr>", "g1"], ["<m2@exemple.fr>", "g2"]]));
    expect(await index.jetonDelta(BOITE)).toMatchObject({ jeton: "delta-1", erreur: null, resynchroLe: null });

    h.avancer(300_000);
    const b2 = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta, maintenant: h.maintenant });
    expect(recus[1]!.jeton).toBe("delta-1");
    expect(b2).toMatchObject({ ajoutes: 0, retires: 0, complet: true });
    expect(await index.compter(BOITE)).toBe(2);
  });

  it("un retrait sort le mail de l'index (par son id Graph) et le bilan le nomme", async () => {
    const index = new MemoireReceptionIndex();
    await index.appliquer(BOITE, { ajoutes: [mail(1), mail(2)], retires: [] });
    await index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    const { delta } = deltaFictif([{ retires: ["g1"] }]);
    const b = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta });
    expect(b.sortis).toEqual(["<m1@exemple.fr>"]);
    expect((await index.enReception(BOITE)).map((m) => m.id)).toEqual(["g2"]);
  });

  it("budget depasse : complet = false, le jeton de reprise est garde, le passage suivant reprend et finit", async () => {
    const h = horloge();
    const index = new MemoireReceptionIndex(h.maintenant);
    const { delta, recus } = deltaFictif([
      { ajoutes: [mail(1)], jeton: "next-1", complet: false },
      { ajoutes: [mail(2)], jeton: "delta-1", complet: true },
    ]);
    const b1 = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta, maintenant: h.maintenant });
    expect(b1.complet).toBe(false);
    expect(await index.jetonDelta(BOITE)).toMatchObject({ jeton: "next-1", resynchroLe: "2026-10-27T10:00:00.000Z" });

    h.avancer(300_000);
    const b2 = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta, maintenant: h.maintenant });
    expect(recus[1]!.jeton).toBe("next-1");
    expect(b2.complet).toBe(true);
    expect(await index.jetonDelta(BOITE)).toMatchObject({ jeton: "delta-1", resynchroLe: null });
    expect(await index.compter(BOITE)).toBe(2);
  });

  it("jeton expire : la relecture complete sort de l'index les mails qu'elle ne revoit pas", async () => {
    const h = horloge();
    const index = new MemoireReceptionIndex(h.maintenant);
    await index.appliquer(BOITE, { ajoutes: [mail(1), mail(2), mail(3)], retires: [] });
    await index.enregistrerJetonDelta(BOITE, { jeton: "delta-vieux" });
    h.avancer(3_600_000);
    const { delta } = deltaFictif([{ ajoutes: [mail(2), mail(3)], jeton: "delta-neuf", reinitialise: true }]);
    const b = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta, maintenant: h.maintenant });
    expect(b.nonRevus).toBe(1);
    expect((await index.enReception(BOITE)).map((m) => m.id)).toEqual(["g2", "g3"]);
  });

  it("filtre aussi cote code les mails d'avant la mise en service", async () => {
    const index = new MemoireReceptionIndex();
    const { delta } = deltaFictif([{ ajoutes: [mail(1, 3), mail(2)] }]);
    const b = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta });
    expect(b.ajoutes).toBe(1);
    expect((await index.enReception(BOITE)).map((m) => m.id)).toEqual(["g2"]);
  });

  it("Graph en panne : le jeton reste, l'erreur est notee, l'index ne bouge pas", async () => {
    const index = new MemoireReceptionIndex();
    await index.appliquer(BOITE, { ajoutes: [mail(1)], retires: [] });
    await index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    const delta: ReceptionDeltaProvider = { lireDelta: async () => Promise.reject(new Error("Graph delta 503")) };
    const b = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta });
    expect(b.erreur).toBe("Graph delta 503");
    expect(await index.jetonDelta(BOITE)).toMatchObject({ jeton: "delta-1", erreur: "Graph delta 503" });
    expect(await index.compter(BOITE)).toBe(1);
  });

  it("table absente : rien n'est lu, le bilan le dit", async () => {
    const index = { jetonDelta: async () => Promise.reject(new IndexReceptionAbsent()) } as unknown as ReceptionIndex;
    const { delta } = deltaFictif([]);
    const b = await synchroniserReception(BOITE, { budgetMs: 20_000, index, delta });
    expect(b.indexDisponible).toBe(false);
    expect(delta.lireDelta).not.toHaveBeenCalled();
  });
});

describe("lireReception, compterDansLIndex", () => {
  it("lit l'index, les plus anciens d'abord, sans les mails sortis", async () => {
    const index = new MemoireReceptionIndex();
    await index.appliquer(BOITE, { ajoutes: [mail(3), mail(1), mail(2)], retires: [] });
    await index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    await marquerSortis(index, BOITE, ["<m2@exemple.fr>"]);
    const l = await lireReception(BOITE, { index });
    expect(l.source).toBe("index");
    expect(l.mails.map((m) => m.id)).toEqual(["g1", "g3"]);
    expect(await compterDansLIndex(BOITE, index)).toBe(2);
    expect(lireRecents).not.toHaveBeenCalled();

    // Une annulation le remet, avec son nouvel id.
    await marquerRemis(index, BOITE, "<m2@exemple.fr>", "g2-remis");
    expect((await lireReception(BOITE, { index })).mails.map((m) => m.id)).toEqual(["g1", "g2-remis", "g3"]);
  });

  it("table absente : repli sur la lecture directe (les plus recents), remise dans l'ordre d'arrivee", async () => {
    const index = { jetonDelta: async () => Promise.reject(new IndexReceptionAbsent()), compter: async () => Promise.reject(new IndexReceptionAbsent()) } as unknown as ReceptionIndex;
    lireRecents.mockResolvedValue([mail(3), mail(2), mail(1)]);
    const l = await lireReception(BOITE, { index, synchroniser: true });
    expect(l.source).toBe("direct");
    expect(l.mails.map((m) => m.id)).toEqual(["g1", "g2", "g3"]);
    expect(lireRecents).toHaveBeenCalledWith({ email: BOITE, max: 100, depuis: "2026-10-04T22:00:00Z" });
    expect(await compterDansLIndex(BOITE, index)).toBeNull();
  });

  it("l'ecran ne relit pas une boite lue il y a moins de 2 min", async () => {
    const h = horloge();
    const index = new MemoireReceptionIndex(h.maintenant);
    await index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    h.avancer(60_000);
    const l = await lireReception(BOITE, { index, synchroniser: true, maintenant: h.maintenant });
    expect(l).toMatchObject({ source: "index", majLe: "2026-10-27T10:00:00.000Z", avertissement: null });
  });

  it("marquerSortis ne fait jamais echouer le geste", async () => {
    const index = { sortir: async () => Promise.reject(new Error("Supabase 500")) } as unknown as ReceptionIndex;
    const silence = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(marquerSortis(index, BOITE, ["<m1@exemple.fr>"])).resolves.toBeUndefined();
    silence.mockRestore();
  });

  it("purge les mails sortis depuis plus de 30 jours", async () => {
    const h = horloge();
    const index = new MemoireReceptionIndex(h.maintenant);
    await index.appliquer(BOITE, { ajoutes: [mail(1), mail(2)], retires: [] });
    await index.sortir(BOITE, ["<m1@exemple.fr>"]);
    h.avancer(31 * 24 * 3600 * 1000);
    await index.sortir(BOITE, ["<m2@exemple.fr>"]);
    expect(await purgerSortis(BOITE, index, h.maintenant)).toBe(1);
  });
});
