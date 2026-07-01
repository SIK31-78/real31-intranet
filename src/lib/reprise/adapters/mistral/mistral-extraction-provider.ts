// Adapter Mistral (EU) du port ExtractionProvider. Decision RGPD : toute l'extraction
// (structure ET proprietaires/PII) passe par Mistral. Deux etapes :
//   1. OCR des PDF (mistral-ocr-latest) -> markdown ;
//   2. extraction structuree JSON (chat completions, JSON forcee) selon les regles cabinet.
// La normalisation (casse, codes cles, ids) et la validation (auto-checks) sont en aval.
//
// Style calque sur l'adapter Mistral de real31-intranet : fetch + retry/backoff + throttle,
// extraction du JSON, cle MISTRAL_API_KEY.

import type {
  DocumentSource,
  ExtractionProvider,
  ResultatPatrimoine,
  ResultatProprietaires,
} from "@/lib/reprise/ports/extraction-provider";
import { normaliserPatrimoine, normaliserProprietaires } from "@/lib/reprise/adapters/shared/normaliser";
import { SYSTEME_PATRIMOINE, SYSTEME_PROPRIETAIRES, extraireJson } from "@/lib/reprise/adapters/shared/prompts-extraction";

const BASE = "https://api.mistral.ai/v1";
const MODEL_OCR = process.env.MODEL_OCR || "mistral-ocr-latest";
const MODEL_EXTRACTION = process.env.MODEL_EXTRACTION || "mistral-large-latest";

// Throttle simple (le tier gratuit Mistral limite ~1 req/s).
let dernierAppel = 0;
async function attendreCreneau(): Promise<void> {
  const attente = dernierAppel + 1200 - Date.now();
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  dernierAppel = Date.now();
}

function cle(): string {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new Error("MISTRAL_API_KEY absente (.env.local)");
  return k;
}

async function appel(path: string, body: unknown): Promise<Response> {
  await attendreCreneau();
  for (let tentative = 0; tentative < 5; tentative++) {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cle()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.status === 429 || r.status >= 500) {
      const retryAfter = Number(r.headers.get("retry-after"));
      await new Promise((res) => setTimeout(res, retryAfter > 0 ? retryAfter * 1000 : 800 * (tentative + 1)));
      continue;
    }
    if (!r.ok) throw new Error(`Mistral ${path} ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return r;
  }
  throw new Error(`Mistral ${path} : rate limit persistant apres retries`);
}

/** OCR d'un PDF -> markdown (toutes pages concatenees). */
async function ocr(doc: DocumentSource): Promise<string> {
  const b64 = Buffer.from(doc.contenu).toString("base64");
  const r = await appel("/ocr", {
    model: MODEL_OCR,
    document: { type: "document_url", document_url: `data:${doc.mime || "application/pdf"};base64,${b64}` },
    include_image_base64: false,
  });
  const j = (await r.json()) as { pages?: { markdown?: string }[] };
  return (j.pages ?? []).map((p) => p.markdown ?? "").join("\n\n");
}

async function ocrTous(docs: DocumentSource[]): Promise<string> {
  const parties: string[] = [];
  for (const d of docs) parties.push(`### DOCUMENT : ${d.nom}\n\n${await ocr(d)}`);
  return parties.join("\n\n---\n\n");
}

async function extraireJsonStructure(systeme: string, texte: string): Promise<unknown> {
  const r = await appel("/chat/completions", {
    model: MODEL_EXTRACTION,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systeme },
      { role: "user", content: texte },
    ],
  });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const contenu = j.choices?.[0]?.message?.content ?? "{}";
  return JSON.parse(extraireJson(contenu));
}

export class MistralExtractionProvider implements ExtractionProvider {
  async extrairePatrimoine(docs: DocumentSource[]): Promise<ResultatPatrimoine> {
    const texte = await ocrTous(docs);
    return normaliserPatrimoine(await extraireJsonStructure(SYSTEME_PATRIMOINE, texte));
  }

  async extraireProprietaires(docs: DocumentSource[]): Promise<ResultatProprietaires> {
    const texte = await ocrTous(docs);
    return normaliserProprietaires(await extraireJsonStructure(SYSTEME_PROPRIETAIRES, texte));
  }
}
