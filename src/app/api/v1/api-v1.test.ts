// Tests des handlers /api/v1 (un par famille d'endpoint) : forme de reponse,
// 401/403, pagination, cloisonnement des ecritures, absence de PII. 100 % offline :
// COPRO_SOURCE non defini -> le routeur sert les adapters MOCK ; les cles sont creees
// via creerCleApi (auth) et vivent dans le store mock du process de test.

import { beforeAll, describe, expect, it } from "vitest";
import { creerCleApi } from "@/lib/auth/cle-api";
import { GET as getCopros } from "./copros/route";
import { GET as getCopro } from "./copros/[code]/route";
import { GET as getEcheances } from "./echeances/route";
import { GET as getAgUrgentes } from "./ag-urgentes/route";
import { GET as getSupervision } from "./supervisions/[agId]/route";
import { POST as postItem } from "./supervisions/[agId]/items/[itemId]/route";
import { GET as getProblemes } from "./problemes/route";
import { GET as getDossiers } from "./dossiers/route";
import { GET as getEchangesCompta } from "./compta/echanges/route";
import { GET as getCompta } from "./compta/[code]/[agDate]/route";
import { POST as postNote } from "./compta/[code]/[agDate]/notes/route";
import { GET as getOpenapi } from "./openapi.json/route";

let cleLecture = ""; // cle CABINET : lecture transverse
let cleGestionnaire = ""; // cle liee a "el" : lecture + les 2 ecritures

beforeAll(async () => {
  cleLecture = (await creerCleApi({ nom: "cabinet", scopes: ["lecture"] })).cleEnClair;
  cleGestionnaire = (
    await creerCleApi({
      nom: "machine EL",
      scopes: ["lecture", "ecriture:supervision", "ecriture:compta"],
      managerId: "el",
    })
  ).cleEnClair;
});

function req(url: string, cle?: string, init?: RequestInit): Request {
  return new Request(`http://intranet.test${url}`, {
    ...init,
    headers: {
      ...(cle ? { authorization: `Bearer ${cle}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

function params<T>(p: T): { params: Promise<T> } {
  return { params: Promise.resolve(p) };
}

async function corps(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("auth commune (famille : toutes les routes)", () => {
  it("sans cle -> 401 cle_invalide au format {ok:false, code, message}", async () => {
    const res = await getCopros(req("/api/v1/copros"), {});
    expect(res.status).toBe(401);
    const b = await corps(res);
    expect(b).toMatchObject({ ok: false, code: "cle_invalide" });
    expect(typeof b.message).toBe("string");
  });

  it("cle au scope insuffisant sur une ECRITURE -> 403 scope_manquant", async () => {
    const res = await postItem(
      req("/api/v1/supervisions/e1/items/x", cleLecture, {
        method: "POST",
        body: JSON.stringify({ statut: "ok" }),
      }),
      params({ agId: "e1", itemId: "log.mise-sous-pli-planifiee" }),
    );
    expect(res.status).toBe(403);
    expect((await corps(res)).code).toBe("scope_manquant");
  });

  it("cle CABINET porteuse d'un scope d'ecriture -> 403 ecriture_exige_gestionnaire", async () => {
    const { cleEnClair } = await creerCleApi({ nom: "cabinet-ecriture", scopes: ["ecriture:compta"] });
    const res = await postNote(
      req("/api/v1/compta/S104/2026-05-28/notes", cleEnClair, {
        method: "POST",
        body: JSON.stringify({ texte: "test" }),
      }),
      params({ code: "S104", agDate: "2026-05-28" }),
    );
    expect(res.status).toBe(403);
    expect((await corps(res)).code).toBe("ecriture_exige_gestionnaire");
  });
});

describe("GET /copros (famille listes + pagination)", () => {
  it("forme de reponse + pagination cursor sans doublon ni trou", async () => {
    const p1 = await corps(await getCopros(req("/api/v1/copros?limit=2", cleLecture), {}));
    expect(p1.ok).toBe(true);
    const copros1 = p1.copros as { code: string; etat: string }[];
    expect(copros1).toHaveLength(2);
    expect(copros1[0]).toHaveProperty("code");
    expect(copros1[0]).toHaveProperty("etat");
    expect(p1.nextCursor).toBeDefined();

    const p2 = await corps(
      await getCopros(req(`/api/v1/copros?limit=100&cursor=${p1.nextCursor}`, cleLecture), {}),
    );
    const codes1 = copros1.map((c) => c.code);
    const codes2 = (p2.copros as { code: string }[]).map((c) => c.code);
    expect(codes2.some((c) => codes1.includes(c))).toBe(false);
    expect(codes1.length + codes2.length).toBe(p1.total);
  });

  it("parametre etat invalide -> 400 parametres_invalides", async () => {
    const res = await getCopros(req("/api/v1/copros?etat=nimporte", cleLecture), {});
    expect(res.status).toBe(400);
    expect((await corps(res)).code).toBe("parametres_invalides");
  });
});

describe("GET /copros/{code} (famille fiche)", () => {
  it("fiche complete, SANS PII coproprietaires (ni conseil syndical, ni debiteurs)", async () => {
    const res = await getCopro(req("/api/v1/copros/S104", cleLecture), params({ code: "S104" }));
    expect(res.status).toBe(200);
    const texte = JSON.stringify(await corps(res));
    expect(texte).toContain('"code":"S104"');
    expect(texte).toContain('"equipe"');
    expect(texte).toContain('"jalons"');
    // Les blocs nominatifs d'owners ne doivent JAMAIS sortir sur l'API v1.
    expect(texte).not.toContain("conseilSyndical");
    expect(texte).not.toContain("debiteurs");
  });

  it("copro inconnue -> 404 introuvable", async () => {
    const res = await getCopro(req("/api/v1/copros/ZZZ", cleLecture), params({ code: "ZZZ" }));
    expect(res.status).toBe(404);
    expect((await corps(res)).code).toBe("introuvable");
  });
});

describe("GET /echeances (famille jalons)", () => {
  it("jalons non accomplis par defaut, tries par date cible", async () => {
    const b = await corps(await getEcheances(req("/api/v1/echeances", cleLecture), {}));
    expect(b.ok).toBe(true);
    const echeances = b.echeances as { cibleDate: string; statut: string; coproCode: string }[];
    expect(echeances.length).toBeGreaterThan(0);
    expect(echeances.every((e) => e.statut !== "accompli")).toBe(true);
    const dates = echeances.map((e) => e.cibleDate);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("GET /ag-urgentes (famille cycle AG)", () => {
  it("forme de reponse : lignes derivees de l'action du moment", async () => {
    const b = await corps(await getAgUrgentes(req("/api/v1/ag-urgentes", cleLecture), {}));
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.agUrgentes)).toBe(true);
    for (const l of b.agUrgentes as Record<string, unknown>[]) {
      expect(l).toHaveProperty("coproCode");
      expect(l).toHaveProperty("prochaineAction");
      expect(l).toHaveProperty("lien");
    }
  });
});

describe("GET+POST /supervisions (famille supervision)", () => {
  it("lecture : progression + sections + items", async () => {
    const res = await getSupervision(req("/api/v1/supervisions/e1", cleLecture), params({ agId: "e1" }));
    expect(res.status).toBe(200);
    const sup = (await corps(res)).supervision as Record<string, unknown>;
    expect(sup.id).toBe("e1");
    expect(sup.progression).toHaveProperty("pourcentage");
    expect(Array.isArray(sup.sections)).toBe(true);
  });

  it("supervision inconnue -> 404", async () => {
    const res = await getSupervision(req("/api/v1/supervisions/zz", cleLecture), params({ agId: "zz" }));
    expect(res.status).toBe(404);
  });

  it("ECRITURE : cocher un item avec la cle gestionnaire (scope + liaison ok)", async () => {
    const res = await postItem(
      req("/api/v1/supervisions/e1/items/log.mise-sous-pli-planifiee", cleGestionnaire, {
        method: "POST",
        body: JSON.stringify({ statut: "ok", commentaire: "fait via API" }),
      }),
      params({ agId: "e1", itemId: "log.mise-sous-pli-planifiee" }),
    );
    expect(res.status).toBe(200);
    const b = await corps(res);
    expect(b).toMatchObject({ ok: true, item: { itemId: "log.mise-sous-pli-planifiee", statut: "ok" } });
    expect(b.par).toBe("EL"); // auteur = initiales du gestionnaire lie a la cle

    // L'etat est bien ecrit (relecture) et l'ecriture est idempotente-friendly :
    // rejouer le meme statut aboutit au meme etat final.
    const relu = await getSupervision(req("/api/v1/supervisions/e1", cleLecture), params({ agId: "e1" }));
    const sup = (await corps(relu)).supervision as {
      sections: { items: { id: string; statut: string }[] }[];
    };
    const item = sup.sections.flatMap((s) => s.items).find((i) => i.id === "log.mise-sous-pli-planifiee");
    expect(item?.statut).toBe("ok");
  });

  it("statut hors domaine -> 400", async () => {
    const res = await postItem(
      req("/api/v1/supervisions/e1/items/x", cleGestionnaire, {
        method: "POST",
        body: JSON.stringify({ statut: "non_verifie" }),
      }),
      params({ agId: "e1", itemId: "log.mise-sous-pli-planifiee" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /problemes + /dossiers (familles worklists)", () => {
  it("problemes : groupes par copro", async () => {
    const b = await corps(await getProblemes(req("/api/v1/problemes", cleLecture), {}));
    expect(b.ok).toBe(true);
    expect(Array.isArray(b.problemes)).toBe(true);
  });

  it("dossiers : forme + JAMAIS la cible nominative (PII)", async () => {
    const b = await corps(await getDossiers(req("/api/v1/dossiers", cleLecture), {}));
    expect(b.ok).toBe(true);
    expect(JSON.stringify(b)).not.toContain('"cible"');
  });

  it("dossiers : filtre statut invalide -> 400", async () => {
    const res = await getDossiers(req("/api/v1/dossiers?statut=perdu", cleLecture), {});
    expect(res.status).toBe(400);
  });
});

describe("GET+POST /compta (famille compta)", () => {
  it("echanges ouverts : seulement les copros avec des notes non resolues", async () => {
    const b = await corps(await getEchangesCompta(req("/api/v1/compta/echanges", cleLecture), {}));
    expect(b.ok).toBe(true);
    const echanges = b.echanges as { notesOuvertes: number }[];
    expect(echanges.every((e) => e.notesOuvertes > 0)).toBe(true);
  });

  it("etat compta d'une AG : flags + checklist + notes", async () => {
    const res = await getCompta(
      req("/api/v1/compta/S104/2026-05-28", cleLecture),
      params({ code: "S104", agDate: "2026-05-28" }),
    );
    expect(res.status).toBe(200);
    const b = await corps(res);
    expect(b).toMatchObject({ ok: true, coproCode: "S104", agDate: "2026-05-28" });
    expect(b).toHaveProperty("comptesVerifies");
    expect(b).toHaveProperty("statutChecklist");
    expect(Array.isArray(b.notes)).toBe(true);
  });

  it("date mal formee -> 400", async () => {
    const res = await getCompta(
      req("/api/v1/compta/S104/28-05-2026", cleLecture),
      params({ code: "S104", agDate: "28-05-2026" }),
    );
    expect(res.status).toBe(400);
  });

  it("ECRITURE : poser une note, puis rejeu Idempotency-Key -> pas de doublon", async () => {
    const idem = { "idempotency-key": `test-${Date.now()}` };
    const r1 = await postNote(
      req("/api/v1/compta/S104/2026-05-28/notes", cleGestionnaire, {
        method: "POST",
        body: JSON.stringify({ texte: "Question sur le rappro bancaire" }),
        headers: idem,
      }),
      params({ code: "S104", agDate: "2026-05-28" }),
    );
    expect(r1.status).toBe(201);
    expect(await corps(r1)).toMatchObject({ ok: true, rejoue: false, par: "EL" });

    const r2 = await postNote(
      req("/api/v1/compta/S104/2026-05-28/notes", cleGestionnaire, {
        method: "POST",
        body: JSON.stringify({ texte: "Question sur le rappro bancaire" }),
        headers: idem,
      }),
      params({ code: "S104", agDate: "2026-05-28" }),
    );
    expect(r2.status).toBe(200);
    expect(await corps(r2)).toMatchObject({ ok: true, rejoue: true });

    // La note n'existe qu'UNE fois dans le fil.
    const etat = await corps(
      await getCompta(req("/api/v1/compta/S104/2026-05-28", cleLecture), params({ code: "S104", agDate: "2026-05-28" })),
    );
    const notes = (etat.notes as { texte: string }[]).filter(
      (n) => n.texte === "Question sur le rappro bancaire",
    );
    expect(notes).toHaveLength(1);
  });

  it("texte vide -> 400", async () => {
    const res = await postNote(
      req("/api/v1/compta/S104/2026-05-28/notes", cleGestionnaire, {
        method: "POST",
        body: JSON.stringify({ texte: "  " }),
      }),
      params({ code: "S104", agDate: "2026-05-28" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /openapi.json (famille spec)", () => {
  it("spec OpenAPI 3.1 couvrant toute la surface", async () => {
    const res = await getOpenapi(req("/api/v1/openapi.json", cleLecture), {});
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe("3.1.0");
    for (const chemin of [
      "/copros",
      "/copros/{code}",
      "/echeances",
      "/ag-urgentes",
      "/supervisions/{agId}",
      "/supervisions/{agId}/items/{itemId}",
      "/problemes",
      "/dossiers",
      "/dossiers/{id}",
      "/compta/echanges",
      "/compta/{code}/{agDate}",
      "/compta/{code}/{agDate}/notes",
      "/openapi.json",
    ]) {
      expect(spec.paths).toHaveProperty(chemin);
    }
  });

  it("la spec aussi est derriere l'auth", async () => {
    const res = await getOpenapi(req("/api/v1/openapi.json"), {});
    expect(res.status).toBe(401);
  });
});
