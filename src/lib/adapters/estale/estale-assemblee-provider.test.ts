// Test de l'adapter assemblee eStale (audit API 2026-07-16) : la liste des condos
// accessibles est mise en cache module (TTL) au lieu d'etre refetchee a chaque appel.
// estaleGql est mocke : aucun appel reseau reel.

import { describe, it, expect, vi } from "vitest";
import { EstaleAssembleeProvider } from "./estale-assemblee-provider";
import { estaleGql } from "./client";

vi.mock("./client", () => ({
  estaleGql: vi.fn(),
}));

const gql = vi.mocked(estaleGql);

function repondre(query: string): unknown {
  if (query.includes("condos(archived: false)")) {
    return { me: { collaborator: { condos: [{ id: "condo-1", reference: "S0299" }] } } };
  }
  if (query.includes("meetings")) {
    return {
      condo: {
        meetings: [
          {
            id: "meeting-1",
            name: "AGO 2026",
            category: "ORDINARY",
            startAt: "2026-09-01T18:00:00Z",
            isClosed: false,
            motions: [],
          },
        ],
      },
    };
  }
  throw new Error(`query inattendue : ${query.slice(0, 80)}`);
}

describe("EstaleAssembleeProvider (cache condos)", () => {
  it("resout la copro via le cache : 2 getAssemblee = 1 seule query condos", async () => {
    gql.mockImplementation(async (query: string) => repondre(query) as never);
    const provider = new EstaleAssembleeProvider();

    const a1 = await provider.getAssemblee("S299");
    const a2 = await provider.getAssemblee("S0299");
    expect(a1?.meetingId).toBe("meeting-1");
    expect(a2?.meetingId).toBe("meeting-1");

    const queriesCondos = gql.mock.calls.filter(([q]) => q.includes("condos(archived: false)"));
    expect(queriesCondos).toHaveLength(1); // liste chargee UNE fois (TTL 10 min)

    const queriesMeetings = gql.mock.calls.filter(([q]) => q.includes("meetings"));
    expect(queriesMeetings).toHaveLength(2); // l'AG, elle, est bien relue a chaque fois
  });
});

// --- Idempotence de appliquerOdj (audit API 2026-07-16, P0-4) ----------------
// Fake eStale STATEFUL : les mutations modifient un etat en memoire, les queries le relisent.
// Permet de rejouer le scenario reel : 502 au milieu -> relance -> etat final sans doublon.

type FauxMotion = { id: string; rank: string; type: string; title: string; parentId: string | null };

const BANK = [
  { id: "bank-a", type: "generic", rank: "10", title: "Reso A", body: "Corps A", majority: "A24", preamble: null, postamble: null, comment: null },
  { id: "bank-b", type: "generic", rank: "11", title: "Reso B", body: "Corps B", majority: "A25", preamble: null, postamble: null, comment: null },
];

class FauxEstale {
  motions = new Map<string, FauxMotion>();
  private seq = 0;
  /** Nombre de creations reussies avant de simuler un 502 (null = jamais d'echec). */
  echouerCreationApres: number | null = null;
  creations = 0;
  suppressions = 0;

  ajouterExistante(id: string, title: string, rank: string): void {
    this.motions.set(id, { id, rank, type: "generic", title, parentId: null });
  }

  repondre(query: string, vars?: Record<string, unknown>): unknown {
    if (query.includes("condos(archived: false)")) {
      return { me: { collaborator: { condos: [{ id: "condo-1", reference: "S0299" }] } } };
    }
    if (query.includes("MotionsAg")) {
      return {
        condo: {
          meeting: {
            motions: [...this.motions.values()].map((m) => ({
              id: m.id,
              rank: m.rank,
              type: m.type,
              title: m.title,
              parent: m.parentId ? { id: m.parentId } : null,
            })),
          },
        },
      };
    }
    if (query.includes("motionsBank")) {
      return { me: { collaborator: { establishment: { motionsBank: BANK } } } };
    }
    if (query.includes("mutation Suppr")) {
      this.motions.delete(String((vars as { id: string }).id));
      this.suppressions++;
      return {};
    }
    if (query.includes("AjoutMotion")) {
      if (this.echouerCreationApres !== null && this.creations >= this.echouerCreationApres) {
        throw new Error("Estale HTTP 502");
      }
      this.creations++;
      const input = (vars as { input: { type: string; title: string } }).input;
      const id = `m-${++this.seq}`;
      this.motions.set(id, { id, rank: "999", type: input.type, title: input.title, parentId: null });
      return { updateMeeting: { createMotion: { id } } };
    }
    if (query.includes("Ordonner")) {
      const liste = (vars as { in: { motionID: string; rank: string }[] }).in;
      const topParRang = new Map<string, string>();
      for (const o of liste) if (!o.rank.includes(".")) topParRang.set(o.rank, o.motionID);
      for (const o of liste) {
        const m = this.motions.get(o.motionID);
        if (!m) throw new Error(`orderMotions : motion inconnue ${o.motionID}`);
        m.rank = o.rank;
        m.parentId = o.rank.includes(".") ? (topParRang.get(o.rank.split(".")[0]) ?? null) : null;
      }
      return {};
    }
    throw new Error(`query inattendue : ${query.slice(0, 80)}`);
  }
}

describe("EstaleAssembleeProvider.appliquerOdj (idempotence par reconciliation)", () => {
  // Composition envoyee par l'UI : retirer e2, ajouter Reso A + Reso B (bank) + une libre,
  // garder e1 en tete. Rejouee A L'IDENTIQUE apres un echec partiel (re-clic du gestionnaire).
  const args: Parameters<EstaleAssembleeProvider["appliquerOdj"]> = [
    "S0299",
    "meeting-1",
    ["e2"], // supprimerMotionIds
    ["bank-a", "bank-b"], // bankItemIds
    [{ titre: "Libre X", corps: "Corps libre", majorite: "A25" }],
    ["e1"], // ordreTopExistant
  ];

  function brancher(faux: FauxEstale) {
    gql.mockImplementation(async (query: string, vars?: Record<string, unknown>) => faux.repondre(query, vars) as never);
  }

  it("echec au milieu puis relance : etat final correct, aucune motion dupliquee", async () => {
    const faux = new FauxEstale();
    faux.ajouterExistante("e1", "Approbation des comptes", "1");
    faux.ajouterExistante("e2", "Ancienne reso a retirer", "2");
    faux.echouerCreationApres = 1; // 1re creation OK, la 2e prend un 502
    brancher(faux);
    const provider = new EstaleAssembleeProvider();

    // 1er clic : echec PARTIEL (e2 supprimee, Reso A creee, puis 502) avec message actionnable.
    await expect(provider.appliquerOdj(...args)).rejects.toThrow(/rien ne sera dupliqué/);
    expect(faux.motions.has("e2")).toBe(false); // la suppression a eu lieu avant le 502
    expect(faux.creations).toBe(1); // Reso A creee avant l'echec

    // Re-clic : la reconciliation saute la suppression deja faite et ADOPTE Reso A.
    faux.echouerCreationApres = null;
    const r = await provider.appliquerOdj(...args);
    expect(r).toEqual({ supprimees: 0, ajoutees: 2, dejaPresentes: 1 });

    // Etat final : e1 + Reso A + Reso B + Libre X, AUCUN doublon de titre, ordre applique.
    const titres = [...faux.motions.values()].sort((a, b) => a.rank.localeCompare(b.rank)).map((m) => m.title);
    expect(titres).toEqual(["Approbation des comptes", "Reso A", "Reso B", "Libre X"]);
    expect(new Set(titres).size).toBe(titres.length);
    expect(faux.creations).toBe(3); // 3 creations en TOUT sur les deux passes (pas 4, pas 6)
  });

  it("double application complete = no-op (0 ajout, 0 retrait, tout deja present)", async () => {
    const faux = new FauxEstale();
    faux.ajouterExistante("e1", "Approbation des comptes", "1");
    faux.ajouterExistante("e2", "Ancienne reso a retirer", "2");
    brancher(faux);
    const provider = new EstaleAssembleeProvider();

    const r1 = await provider.appliquerOdj(...args);
    expect(r1).toEqual({ supprimees: 1, ajoutees: 3, dejaPresentes: 0 });
    const idsApres1 = [...faux.motions.keys()].sort();

    // Re-clic apres un succes complet : rien n'est recree, rien n'est resupprime.
    const r2 = await provider.appliquerOdj(...args);
    expect(r2).toEqual({ supprimees: 0, ajoutees: 0, dejaPresentes: 3 });
    expect(faux.creations).toBe(3); // aucune creation supplementaire au 2e passage
    expect(faux.suppressions).toBe(1); // la suppression n'est pas rejouee
    expect([...faux.motions.keys()].sort()).toEqual(idsApres1); // memes motions, memes ids
  });

  it("refuse d'appliquer si la copro est introuvable (pas d'application en aveugle)", async () => {
    const faux = new FauxEstale();
    brancher(faux);
    const provider = new EstaleAssembleeProvider();
    await expect(
      provider.appliquerOdj("S9999", "meeting-1", [], [], [], []),
    ).rejects.toThrow(/introuvable/);
    expect(faux.creations).toBe(0);
  });
});
