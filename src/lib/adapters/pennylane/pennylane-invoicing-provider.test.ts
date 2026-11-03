import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemandeEmission } from "@/lib/ports/invoicing-provider";
import { PennylaneInvoicingProvider } from "./pennylane-invoicing-provider";

// L'enchainement reel vers Pennylane, fetch doublé : POST brouillon, puis PUT finalize
// seulement sur opt-in. Le chemin le plus dangereux (le brouillon existe, la validation
// echoue) doit NOMMER le brouillon (audit du 16/09/2026 : zero test sur cette classe).

type Appel = { url: string; method: string; body?: unknown };
const appels: Appel[] = [];
let reponses: Array<{ ok: boolean; status?: number; statusText?: string; json?: unknown; text?: string }> = [];

function reponse(r: (typeof reponses)[number]): Response {
  return {
    ok: r.ok,
    status: r.status ?? (r.ok ? 200 : 500),
    statusText: r.statusText ?? "",
    json: async () => r.json,
    text: async () => r.text ?? "",
  } as unknown as Response;
}

const demande: DemandeEmission = {
  clientRef: "uuid-copro",
  codeEntite: "S001",
  libelle: "Honoraires de suivi de sinistre",
  dateFacture: "2026-09-16",
  lignes: [{ libelle: "Dossier assureur", quantite: 1, prixUnitaireHt: 100, tauxTva: 0.2 }],
};

beforeEach(() => {
  appels.length = 0;
  reponses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      appels.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = reponses.shift();
      if (!r) throw new Error(`fetch inattendu : ${url}`);
      return reponse(r);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("PennylaneInvoicingProvider.emettreFacture", () => {
  it("resout le client, cree le brouillon, et s'arrete la par defaut", async () => {
    reponses = [
      { ok: true, json: { items: [{ id: 777 }] } },
      { ok: true, json: { id: 4242 } },
    ];
    const r = await new PennylaneInvoicingProvider("cle-test", false).emettreFacture(demande);
    expect(r).toEqual({ factureExterneId: "4242", validee: false });
    expect(appels.map((a) => `${a.method} ${a.url.replace("https://app.pennylane.com/api/external/v2", "")}`)).toEqual([
      expect.stringMatching(/^GET \/customers\?sort=-id&filter=/),
      "POST /customer_invoices",
    ]);
    // Le brouillon porte l'id INTERNE du client, jamais l'UUID de la fiche.
    expect((appels[1]!.body as { customer_id: unknown }).customer_id).toBe("777");
    expect((appels[0]!.url.includes(encodeURIComponent("uuid-copro")))).toBe(true);
  });

  it("valide le brouillon quand l'opt-in est pose (PUT finalize apres le POST)", async () => {
    reponses = [
      { ok: true, json: { items: [{ id: 777 }] } },
      { ok: true, json: { id: "4243" } },
      { ok: true },
    ];
    const r = await new PennylaneInvoicingProvider("cle-test", true).emettreFacture(demande);
    expect(r).toEqual({ factureExterneId: "4243", validee: true });
    expect(appels[2]).toMatchObject({ method: "PUT", url: "https://app.pennylane.com/api/external/v2/customer_invoices/4243/finalize" });
  });

  it("l'echec de validation nomme le brouillon deja cree", async () => {
    reponses = [
      { ok: true, json: { items: [{ id: 777 }] } },
      { ok: true, json: { id: 4244 } },
      { ok: false, status: 422, statusText: "Unprocessable", text: '{"error":"missing ledger account"}' },
    ];
    await expect(new PennylaneInvoicingProvider("cle-test", true).emettreFacture(demande)).rejects.toThrow(
      /Validation Pennylane de la facture 4244 : HTTP 422 Unprocessable - [^]*missing ledger account[^]*Le BROUILLON 4244 EXISTE chez Pennylane/,
    );
  });

  it("refuse sans cle, et remonte le corps d'un rejet Pennylane", async () => {
    await expect(new PennylaneInvoicingProvider("", false).emettreFacture(demande)).rejects.toThrow(/PENNYLANE_API_KEY absent/);
    expect(appels).toHaveLength(0);

    reponses = [
      { ok: true, json: { items: [{ id: 777 }] } },
      { ok: false, status: 400, statusText: "Bad Request", text: "vat rate invalid" },
    ];
    await expect(new PennylaneInvoicingProvider("cle-test", false).emettreFacture(demande)).rejects.toThrow(/HTTP 400 Bad Request - vat rate invalid/);
  });

  it("client introuvable pour la reference externe : rien n'est cree", async () => {
    reponses = [{ ok: true, json: { items: [] } }];
    await expect(new PennylaneInvoicingProvider("cle-test", false).emettreFacture(demande)).rejects.toThrow(/Client Pennylane introuvable pour la reference externe uuid-copro/);
    expect(appels).toHaveLength(1);
  });
});

describe("creerClient", () => {
  it("cree un PARTICULIER par POST /individual_customers, a la forme des clients existants (S305)", async () => {
    reponses = [{ ok: true, status: 201, json: { id: 1306659053568 } }];
    const r = await new PennylaneInvoicingProvider("cle").creerClient({
      nom: "SDC 18, rue de Sébastopol - S311",
      adresse: "18 rue de Sébastopol",
      codePostal: "92400",
      ville: "Courbevoie",
      referenceExterne: "uuid-s311",
      emails: ["elsa.peixoto@real31.fr"],
    });
    expect(r).toEqual({ clientExterneId: "1306659053568" });
    expect(appels).toHaveLength(1);
    expect(appels[0]!.url).toBe("https://app.pennylane.com/api/external/v2/individual_customers");
    expect(appels[0]!.method).toBe("POST");
    // Corps strict cote Pennylane (additionalProperties: false) : ni customer_type ni name.
    expect(appels[0]!.body).toEqual({
      first_name: "SDC",
      last_name: "18 RUE DE SEBASTOPOL - S311",
      external_reference: "uuid-s311",
      payment_conditions: "30_days",
      billing_language: "fr_FR",
      emails: ["elsa.peixoto@real31.fr"],
      billing_address: { address: "18 rue de Sébastopol", postal_code: "92400", city: "Courbevoie", country_alpha2: "FR" },
    });
  });

  it("un refus de Pennylane remonte avec son statut et son detail", async () => {
    reponses = [{ ok: false, status: 422, text: "external_reference already taken" }];
    await expect(
      new PennylaneInvoicingProvider("cle").creerClient({ nom: "SDC X - S999", adresse: "a", codePostal: "1", ville: "v", referenceExterne: "u", emails: [] }),
    ).rejects.toThrow(/HTTP 422 - external_reference already taken/);
  });
});
