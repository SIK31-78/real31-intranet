// Test de l'adapter Mistral patrimoine (audit API 2026-07-16) : l'OCR d'un meme document
// est DEDUPLIQUE quand extrairePatrimoine et extraireProprietaires tournent en parallele
// sur les memes objets docs (avant le fix : 2x le cout OCR par analyse). fetch stubbe.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MistralExtractionProvider } from "./mistral-extraction-provider";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
});

afterEach(() => {
  delete process.env.MISTRAL_API_KEY;
  vi.unstubAllGlobals();
});

describe("MistralExtractionProvider (dedup OCR)", () => {
  it("n'OCRise chaque document qu'UNE fois pour les deux extractions paralleles", async () => {
    let nbOcr = 0;
    let nbChat = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal); // timeout pose (fix audit)
        const u = String(url);
        if (u.endsWith("/ocr")) {
          nbOcr++;
          return new Response(JSON.stringify({ pages: [{ markdown: "# page" }] }), { status: 200 });
        }
        nbChat++;
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "{}" } }] }),
          { status: 200 },
        );
      }),
    );

    const docs: DocumentSource[] = [{ nom: "RCP.pdf", contenu: new Uint8Array([1, 2, 3]) }];
    const provider = new MistralExtractionProvider();

    // allSettled : on ne teste PAS la normalisation (schema du modele), seulement le
    // comportement reseau. Les deux missions passent chacune par ocrTous(docs).
    await Promise.allSettled([
      provider.extrairePatrimoine(docs),
      provider.extraireProprietaires(docs),
    ]);

    expect(nbOcr).toBe(1); // avant le fix : 2 (un OCR par mission sur le meme PDF)
    expect(nbChat).toBe(2); // les deux extractions structurees, elles, restent distinctes
  });
});
