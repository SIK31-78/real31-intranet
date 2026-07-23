// Tests de l'auth machine : generation/hash, verification (bonne cle, mauvaise cle,
// revocation, expiration, scopes), idempotence best-effort. 100 % offline : le routeur
// sert l'adapter MOCK (COPRO_SOURCE non defini). Chaque test cree SES cles (pas de
// reset du store : la regle boundaries interdit a auth d'importer un adapter).

import { describe, expect, it } from "vitest";
import {
  creerCleApi,
  genererCleApi,
  hashCleApi,
  idempotenceDejaVue,
  listerClesApi,
  revoquerCleApi,
  verifierCleApi,
} from "./cle-api";

describe("generation / hash", () => {
  it("la cle a la forme real31_<base64url> et le hash est un sha256 hex stable", () => {
    const cle = genererCleApi();
    expect(cle).toMatch(/^real31_[A-Za-z0-9_-]{40,50}$/);
    expect(hashCleApi(cle)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCleApi(cle)).toBe(hashCleApi(cle)); // deterministe
    expect(hashCleApi(genererCleApi())).not.toBe(hashCleApi(cle));
  });

  it("creerCleApi ne persiste QUE le hash + le prefixe (jamais le clair)", async () => {
    const { cleEnClair, enregistrement } = await creerCleApi({ nom: "test", scopes: ["lecture"] });
    expect(cleEnClair.startsWith("real31_")).toBe(true);
    expect(enregistrement.prefixe).toBe(cleEnClair.slice(0, 8));
    // L'enregistrement rendu (et la liste) n'exposent aucun champ contenant le clair ni le hash.
    expect(JSON.stringify(enregistrement)).not.toContain(cleEnClair);
    expect(JSON.stringify(await listerClesApi())).not.toContain(cleEnClair.slice(10));
  });
});

describe("verifierCleApi", () => {
  it("bonne cle + bon scope -> acces, avec managerId de cloisonnement", async () => {
    const { cleEnClair } = await creerCleApi({ nom: "m", scopes: ["lecture"], managerId: "el" });
    const v = await verifierCleApi(`Bearer ${cleEnClair}`, "lecture");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.acces.managerId).toBe("el");
  });

  it("cle cabinet -> pas de managerId (lecture transverse)", async () => {
    const { cleEnClair } = await creerCleApi({ nom: "cabinet", scopes: ["lecture"] });
    const v = await verifierCleApi(`Bearer ${cleEnClair}`, "lecture");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.acces.managerId).toBeUndefined();
  });

  it("header absent / mal forme / cle inconnue -> cle_invalide", async () => {
    await creerCleApi({ nom: "x", scopes: ["lecture"] });
    expect(await verifierCleApi(null, "lecture")).toEqual({ ok: false, refus: "cle_invalide" });
    expect(await verifierCleApi("Bearer pas-un-prefixe", "lecture")).toEqual({ ok: false, refus: "cle_invalide" });
    expect(await verifierCleApi(`Bearer ${genererCleApi()}`, "lecture")).toEqual({ ok: false, refus: "cle_invalide" });
  });

  it("cle revoquee -> cle_revoquee", async () => {
    const { cleEnClair, enregistrement } = await creerCleApi({ nom: "r", scopes: ["lecture"] });
    await revoquerCleApi(enregistrement.id);
    expect(await verifierCleApi(`Bearer ${cleEnClair}`, "lecture")).toEqual({ ok: false, refus: "cle_revoquee" });
  });

  it("cle expiree -> cle_expiree", async () => {
    const { cleEnClair } = await creerCleApi({
      nom: "e",
      scopes: ["lecture"],
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    expect(await verifierCleApi(`Bearer ${cleEnClair}`, "lecture")).toEqual({ ok: false, refus: "cle_expiree" });
  });

  it("scope manquant -> scope_manquant ; ecriture sur cle cabinet -> ecriture_exige_gestionnaire", async () => {
    const { cleEnClair } = await creerCleApi({ nom: "s", scopes: ["lecture", "ecriture:compta"] });
    expect(await verifierCleApi(`Bearer ${cleEnClair}`, "ecriture:supervision")).toEqual({
      ok: false,
      refus: "scope_manquant",
    });
    // Le scope est porte mais la cle n'est pas liee a un gestionnaire : refus.
    expect(await verifierCleApi(`Bearer ${cleEnClair}`, "ecriture:compta")).toEqual({
      ok: false,
      refus: "ecriture_exige_gestionnaire",
    });
  });

  it("l'usage est compte (last_used_at + compteur du jour)", async () => {
    const { cleEnClair, enregistrement } = await creerCleApi({ nom: "u", scopes: ["lecture"] });
    await verifierCleApi(`Bearer ${cleEnClair}`, "lecture");
    await verifierCleApi(`Bearer ${cleEnClair}`, "lecture");
    const apres = (await listerClesApi()).find((c) => c.id === enregistrement.id)!;
    expect(apres.usageJour).toBe(2);
    expect(apres.lastUsedAt).toBeDefined();
    expect(apres.usageJourDate).toBe(new Date().toISOString().slice(0, 10));
  });

  it("l'auteur d'une ECRITURE = initiales du gestionnaire lie", async () => {
    // "el" existe dans le mock gestionnaires (Elise Lambert, EL).
    const { cleEnClair } = await creerCleApi({
      nom: "w",
      scopes: ["ecriture:supervision"],
      managerId: "el",
    });
    const v = await verifierCleApi(`Bearer ${cleEnClair}`, "ecriture:supervision");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.acces.auteur.initiales).toBe("EL");
  });
});

describe("idempotence best-effort", () => {
  it("sans header -> jamais un rejeu ; avec header -> rejeu detecte par cle API", () => {
    expect(idempotenceDejaVue("cle-1", null)).toBe(false);
    expect(idempotenceDejaVue("cle-1", null)).toBe(false);
    expect(idempotenceDejaVue("cle-1", "op-42")).toBe(false); // 1er passage : enregistre
    expect(idempotenceDejaVue("cle-1", "op-42")).toBe(true); // rejeu
    expect(idempotenceDejaVue("cle-2", "op-42")).toBe(false); // autre cle API : independant
  });
});
