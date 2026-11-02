// Vue « Brouillons » (02/11/2026) : seulement MA boîte perso (ni partagée, ni celle d'un
// titulaire par délégation, ni la boîte d'une autre personne), et seulement un brouillon que la
// liste relue côté serveur montre. Gardes et services doublés.

import { beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  session: { id: "g1", email: "julie@real31.fr" } as Record<string, string> | null,
  // Les boîtes de la personne : id -> nature.
  boites: new Map<string, "mienne" | "deleguee" | "partagee">([
    ["julie@real31.fr", "mienne"],
    ["fanny@real31.fr", "deleguee"],
    ["syndic2@real31.fr", "partagee"],
  ]),
  // Les brouillons que la liste montre, par boîte.
  brouillons: new Map<string, { id: string; objet: string; internetMessageId: string }[]>([
    ["julie@real31.fr", [{ id: "d1", objet: "Devis", internetMessageId: "<d1@x>" }]],
  ]),
}));
const graph = vi.hoisted(() => ({
  envoyerBrouillon: vi.fn(async () => {}),
  mettreALaCorbeille: vi.fn(async (p: { internetMessageIds: string[] }) => ({ deplaces: p.internetMessageIds, echecs: [] })),
  lireCorps: vi.fn(async () => "Bonjour"),
}));

vi.mock("@/lib/auth/session", () => ({
  getGestionnaireCourant: async () => etat.session,
  mailModuleActifPour: () => true,
}));
vi.mock("@/lib/observabilite", () => ({ tracer: vi.fn(), signaler: vi.fn(), signalerException: vi.fn() }));
vi.mock("./gardes-boites", () => ({
  boiteCible: async (_g: unknown, b: string) => (etat.boites.has(b.trim().toLowerCase()) ? b.trim().toLowerCase() : null),
  natureBoite: async (_g: unknown, b: string) => etat.boites.get(b) ?? null,
}));
vi.mock("@/lib/adapters/router", () => ({
  getRechercheMail: () => ({
    async brouillons(p: { boite: string }) {
      return etat.brouillons.get(p.boite) ?? [];
    },
    lireCorps: graph.lireCorps,
  }),
  getMailOutboundProvider: () => ({ envoyerBrouillon: graph.envoyerBrouillon }),
  getMailboxProvider: () => ({ mettreALaCorbeille: graph.mettreALaCorbeille }),
}));

import { chargerBrouillonsAction, envoyerBrouillonAction, lireBrouillonAction, supprimerBrouillonAction } from "./actions-brouillons";

const REFUS = { ok: false, erreur: "Les brouillons ne s'affichent que pour votre boîte personnelle." };
const ABSENT = { ok: false, erreur: "Ce brouillon n'est plus dans vos brouillons." };

beforeEach(() => {
  etat.session = { id: "g1", email: "julie@real31.fr" };
  vi.clearAllMocks();
});

describe("actions des brouillons", () => {
  it("liste, lit, envoie et met à la corbeille un brouillon de ma boîte perso", async () => {
    expect(await chargerBrouillonsAction({ boite: "julie@real31.fr" })).toMatchObject({ ok: true, donnees: [{ id: "d1" }] });
    expect(await lireBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true, donnees: "Bonjour" });
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true, donnees: { objet: "Devis" } });
    expect(graph.envoyerBrouillon).toHaveBeenCalledWith({ boite: "julie@real31.fr", id: "d1" });
    expect(await supprimerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toEqual({ ok: true });
    // La corbeille d'Outlook (réversible), par l'internetMessageId relu dans la liste.
    expect(graph.mettreALaCorbeille).toHaveBeenCalledWith({ boite: "julie@real31.fr", internetMessageIds: ["<d1@x>"] });
  });

  it("refuse une boîte partagée, la boîte d'un titulaire par délégation et la boîte d'une autre personne", async () => {
    for (const boite of ["syndic2@real31.fr", "fanny@real31.fr", "marc@real31.fr"]) {
      expect(await chargerBrouillonsAction({ boite })).toEqual(REFUS);
      expect(await envoyerBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
      expect(await supprimerBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
      expect(await lireBrouillonAction({ boite, id: "d1" })).toEqual(REFUS);
    }
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
    expect(graph.mettreALaCorbeille).not.toHaveBeenCalled();
  });

  it("refuse un id absent de mes brouillons (mail reçu, brouillon d'ailleurs) sans rien lire ni écrire", async () => {
    expect(await lireBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(await supprimerBrouillonAction({ boite: "julie@real31.fr", id: "recu-1" })).toEqual(ABSENT);
    expect(graph.lireCorps).not.toHaveBeenCalled();
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
    expect(graph.mettreALaCorbeille).not.toHaveBeenCalled();
  });

  it("sans session : refusé", async () => {
    etat.session = null;
    expect(await chargerBrouillonsAction({ boite: "julie@real31.fr" })).toMatchObject({ ok: false });
    expect(await envoyerBrouillonAction({ boite: "julie@real31.fr", id: "d1" })).toMatchObject({ ok: false });
    expect(graph.envoyerBrouillon).not.toHaveBeenCalled();
  });
});
