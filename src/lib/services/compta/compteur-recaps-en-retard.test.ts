// Pastille « Récap AG » de la barre laterale. Ce qui compte ici : la MEME definition que
// l'alerte de /recap-ag (perimetre portefeuille, jamais la vue comptable), et le COUT
// (memoire de 5 min, valeur connue servie sans attendre, premier calcul borne, echec muet).
// La regle du retard elle-meme est testee dans recaps-en-retard.test.ts et domain/recap-ag.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const etat = vi.hoisted(() => ({
  appels: [] as { params: unknown; aujourdhui: string }[],
  reponse: (): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock("@/lib/services/compta/recaps-en-retard", () => ({
  listerRecapsEnRetard: (params: unknown, aujourdhui: string) => {
    etat.appels.push({ params, aujourdhui });
    return etat.reponse();
  },
}));

import {
  compterRecapsEnRetard,
  oublierRecapsEnRetard,
  retenirRecapsEnRetard,
} from "@/lib/services/compta/compteur-recaps-en-retard";

const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ coproCode: `S${i}` }));

beforeEach(() => {
  oublierRecapsEnRetard();
  etat.appels = [];
  etat.reponse = () => Promise.resolve(lignes(3));
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T10:00:00+02:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("compterRecapsEnRetard", () => {
  it("compte les recaps en retard du PORTEFEUILLE, comme l'alerte variante gestionnaire", async () => {
    expect(await compterRecapsEnRetard("m1", "gestion@real31.fr")).toBe(3);
    expect(etat.appels).toEqual([
      { params: { managerId: "m1", email: "gestion@real31.fr", estComptable: false }, aujourdhui: "2026-10-12" },
    ]);
  });

  it("rend 0 quand rien n'est en retard (la barre n'affiche alors rien)", async () => {
    etat.reponse = () => Promise.resolve([]);
    expect(await compterRecapsEnRetard("m1", null)).toBe(0);
  });

  it("garde la valeur 5 min : les pages suivantes ne relisent rien", async () => {
    await compterRecapsEnRetard("m1", null);
    vi.advanceTimersByTime(4 * 60_000);
    expect(await compterRecapsEnRetard("m1", null)).toBe(3);
    expect(etat.appels).toHaveLength(1);
  });

  it("une memoire par collaborateur", async () => {
    await compterRecapsEnRetard("m1", null);
    etat.reponse = () => Promise.resolve(lignes(1));
    expect(await compterRecapsEnRetard("m2", null)).toBe(1);
    expect(etat.appels).toHaveLength(2);
  });

  it("passe 5 min : sert l'ancienne valeur tout de suite et recalcule en fond", async () => {
    await compterRecapsEnRetard("m1", null);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    etat.reponse = () => Promise.resolve(lignes(1));
    expect(await compterRecapsEnRetard("m1", null)).toBe(3);
    expect(etat.appels).toHaveLength(2);
    await vi.runAllTimersAsync();
    expect(await compterRecapsEnRetard("m1", null)).toBe(1);
  });

  it("premier calcul trop lent : pas de pastille, mais la page suivante l'a", async () => {
    let finir: (v: unknown[]) => void = () => {};
    etat.reponse = () => new Promise((r) => (finir = r));
    const premier = compterRecapsEnRetard("m1", null);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(await premier).toBeNull();
    finir(lignes(2));
    await vi.runAllTimersAsync();
    expect(await compterRecapsEnRetard("m1", null)).toBe(2);
    expect(etat.appels).toHaveLength(1);
  });

  it("un echec ne casse jamais le shell : null, pas d'exception", async () => {
    etat.reponse = () => Promise.reject(new Error("base indisponible"));
    expect(await compterRecapsEnRetard("m1", null)).toBeNull();
  });

  it("la page /recap-ag pose son propre compte : la pastille suit sans attendre", async () => {
    await compterRecapsEnRetard("m1", null);
    retenirRecapsEnRetard("m1", 0);
    expect(await compterRecapsEnRetard("m1", null)).toBe(0);
    expect(etat.appels).toHaveLength(1);
  });
});
