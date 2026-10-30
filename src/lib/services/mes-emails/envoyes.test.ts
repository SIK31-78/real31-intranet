// Vue « Envoyés » d'une boîte partagée (30/10/2026) : 14 jours lus, filtrés au binôme, 30
// affichés ; la boîte perso garde ses 30 derniers. Port simulé, données inventées.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EchangeTrouve } from "@/lib/domain/echanges";

const faux = vi.hoisted(() => ({
  appels: [] as { boite: string; max: number; depuis?: string }[],
  envoyes: [] as EchangeTrouve[],
  corpsLus: [] as string[],
}));
vi.mock("@/lib/adapters/router", () => ({
  getRechercheMail: () => ({
    envoyes: async (p: { boite: string; max: number; depuis?: string }) => {
      faux.appels.push(p);
      return faux.envoyes;
    },
    lireCorps: async (p: { id: string }) => {
      faux.corpsLus.push(p.id);
      return `corps ${p.id}`;
    },
  }),
}));

const { lireEnvoye, listerEnvoyes } = await import("./envoyes");

const envoye = (id: string, objet: string, conversationId?: string): EchangeTrouve => ({
  boite: "syndic2@real31.fr",
  id,
  internetMessageId: `<${id}>`,
  ...(conversationId ? { conversationId } : {}),
  objet,
  deNom: "Syndic 2",
  deAdresse: "syndic2@real31.fr",
  a: [],
  cc: [],
  date: "2026-10-29T10:00:00Z",
  aPiecesJointes: false,
  apercu: "",
});
const perimetre = { conversations: new Set(["c-a"]), references: new Set(["S62"]), referencesAutres: new Set(["S100"]) };

beforeEach(() => {
  faux.appels = [];
  faux.corpsLus = [];
  faux.envoyes = [envoye("1", "S062 · FOCH4* - devis muret"), envoye("2", "S100 - fuite"), envoye("3", "RE: question", "c-a"), envoye("4", "Bonne année")];
});

describe("listerEnvoyes", () => {
  it("boîte partagée : les envoyés des 14 derniers jours, gardés au binôme", async () => {
    const l = await listerEnvoyes("syndic2@real31.fr", perimetre, Date.parse("2026-10-30T12:00:00Z"));
    expect(faux.appels).toEqual([{ boite: "syndic2@real31.fr", max: 1000, depuis: "2026-10-16T12:00:00.000Z" }]);
    expect(l.map((e) => e.id)).toEqual(["1", "3"]);
  });

  it("boîte perso : les 30 derniers, sans fenêtre ni filtre", async () => {
    expect(await listerEnvoyes("moi@real31.fr")).toHaveLength(4);
    expect(faux.appels).toEqual([{ boite: "moi@real31.fr", max: 30 }]);
  });

  it("ni conversation ni copro : rien, sans lire Graph", async () => {
    expect(await listerEnvoyes("syndic2@real31.fr", { conversations: new Set(), references: new Set(), referencesAutres: new Set(["S100"]) })).toEqual([]);
    expect(faux.appels).toEqual([]);
  });
});

describe("lireEnvoye : un envoyé lisible est un envoyé listé (REA-422)", () => {
  it("lit un envoyé de mon portefeuille, refuse celui d'un autre binôme sans le lire", async () => {
    expect(await lireEnvoye("syndic2@real31.fr", "1", perimetre)).toBe("corps 1");
    expect(await lireEnvoye("syndic2@real31.fr", "2", perimetre)).toBeNull();
    expect(faux.corpsLus).toEqual(["1"]);
  });
});
