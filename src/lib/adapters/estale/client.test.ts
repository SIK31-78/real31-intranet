// Le client eStale s'authentifie par cookie de session (compte de service). Ce fichier
// teste UNIQUEMENT la gestion de cette session, parce que c'est la seule partie qui a un
// etat partage entre appels - donc la seule qui peut deraper en concurrence.
//
// Mesure du 2026-09-10 : le login coute 750 ms, une requete GraphQL a session chaude
// 9 a 16 ms. Un login de trop est donc 50 fois le prix d'une requete. D'ou ces tests.
//
// `fetch` est remplace par un espion : aucun appel reseau, aucun credential utilise.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const vraiFetch = globalThis.fetch;

/** Reponse de login qui pose le cookie demande. */
function reponseLogin(cookie: string): Response {
  return {
    ok: true,
    status: 200,
    headers: { getSetCookie: () => [`${cookie}; Path=/; HttpOnly`] },
  } as unknown as Response;
}

/** Reponse GraphQL : 200 avec data, ou le statut demande. */
function reponseGql(statut = 200): Response {
  return {
    ok: statut < 400,
    status: statut,
    json: async () => ({ data: { __typename: "Query" } }),
  } as unknown as Response;
}

/** Retarde une valeur, pour que plusieurs appels se chevauchent vraiment. */
function apres<T>(ms: number, v: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(v), ms));
}

beforeEach(() => {
  vi.resetModules(); // l'etat de session vit dans le MODULE : on repart d'une instance neuve
  process.env.ESTALE_EMAIL = "service@real31.fr";
  process.env.ESTALE_PASSWORD = "peu-importe";
});

afterEach(() => {
  globalThis.fetch = vraiFetch;
});

describe("session eStale : un seul login a la fois", () => {
  it("trois lectures CONCURRENTES sur une instance fraiche ne declenchent qu'UN login", async () => {
    // C'est le cas de l'accueil : AG de la semaine, affaires en cours et complement
    // partent en parallele. Avant, les trois voyaient le cookie vide au meme instant.
    let logins = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/login")) {
        logins++;
        return apres(20, reponseLogin("estale=abc")); // le login est LENT (750 ms en vrai)
      }
      return reponseGql();
    }) as unknown as typeof fetch;

    const { estaleGql } = await import("./client");
    await Promise.all([estaleGql("{ a }"), estaleGql("{ b }"), estaleGql("{ c }")]);

    expect(logins).toBe(1);
  });

  it("les appels suivants reutilisent la session, sans relogin", async () => {
    let logins = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/login")) {
        logins++;
        return reponseLogin("estale=abc");
      }
      return reponseGql();
    }) as unknown as typeof fetch;

    const { estaleGql } = await import("./client");
    await estaleGql("{ a }");
    await estaleGql("{ b }");
    await estaleGql("{ c }");

    expect(logins).toBe(1);
  });

  it("un login qui echoue n'est PAS memorise : l'appel suivant retente", async () => {
    // Le piege classique de la memoisation de promesse : garder une promesse REJETEE
    // condamnerait l'instance a ne plus jamais joindre eStale jusqu'a son recyclage.
    let logins = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/login")) {
        logins++;
        if (logins === 1) return { ok: false, status: 503, headers: { getSetCookie: () => [] } } as unknown as Response;
        return reponseLogin("estale=abc");
      }
      return reponseGql();
    }) as unknown as typeof fetch;

    const { estaleGql } = await import("./client");
    await expect(estaleGql("{ a }")).rejects.toThrow(/Login Estale refuse/);
    await expect(estaleGql("{ b }")).resolves.toBeDefined(); // la 2e tentative passe

    expect(logins).toBe(2);
  });
});

describe("session eStale : renouvellement apres 401", () => {
  it("un 401 declenche un relogin et rejoue la requete", async () => {
    let logins = 0;
    let gql = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/api/login")) {
        logins++;
        return reponseLogin(`estale=v${logins}`);
      }
      gql++;
      return reponseGql(gql === 1 ? 401 : 200); // la 1re requete tombe sur une session expiree
    }) as unknown as typeof fetch;

    const { estaleGql } = await import("./client");
    await expect(estaleGql("{ a }")).resolves.toBeDefined();

    expect(logins).toBe(2);
    expect(gql).toBe(2);
  });

  it("N requetes rentrees en 401 avec le MEME vieux cookie ne relancent qu'UN login", async () => {
    // Session expiree = tout le monde rejoue en meme temps. Sans la garde, chaque 401
    // jetait le cookie tout neuf pose par le voisin : une tempete de logins qui
    // s'entretient elle-meme, au pire moment.
    let logins = 0;
    let version = 0; // numero du cookie, INDEPENDANT du compteur de logins remis a zero
    let v1Expire = false; // la session ne meurt qu'APRES l'amorce
    const vus = new Set<string>();
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith("/api/login")) {
        logins++;
        version++;
        return apres(20, reponseLogin(`estale=v${version}`));
      }
      const cookie = String((init?.headers as Record<string, string>)?.cookie ?? "");
      vus.add(cookie);
      return reponseGql(v1Expire && cookie === "estale=v1" ? 401 : 200);
    }) as unknown as typeof fetch;

    const { estaleGql } = await import("./client");
    await estaleGql("{ amorce }"); // pose v1
    logins = 0; // on ne compte que les relogins provoques par les 401
    v1Expire = true;

    await Promise.all([estaleGql("{ a }"), estaleGql("{ b }"), estaleGql("{ c }")]);

    expect(logins).toBe(1);
    expect(vus.has("estale=v2")).toBe(true);
  });
});
