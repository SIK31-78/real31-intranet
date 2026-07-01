// Adapter Claude (Anthropic) du port ExtractionProvider. Routage MODELE PAR MISSION,
// interne a l'adapter (le port n'en sait rien) :
//   - extrairePatrimoine (structure, tache dure) -> modele CLAUDE_MODEL_PATRIMOINE
//   - extraireProprietaires (owners, transcription) -> modele CLAUDE_MODEL_PROPRIETAIRES
// Claude lit les PDF NATIVEMENT (bloc document base64, scans via vision) : pas de librairie OCR.
// inference_geo (residence UE) est OPTIONNEL : envoye seulement si CLAUDE_INFERENCE_GEO est defini.
// Le SDK @anthropic-ai/sdk est CONFINE ici (isolation hexagonale).

import Anthropic from "@anthropic-ai/sdk";
import type {
  DocumentSource,
  ExtractionProvider,
  ResultatPatrimoine,
  ResultatProprietaires,
} from "@/lib/reprise/ports/extraction-provider";
import { normaliserPatrimoine, normaliserProprietaires } from "@/lib/reprise/adapters/shared/normaliser";
import { SYSTEME_PATRIMOINE, SYSTEME_PROPRIETAIRES, extraireJson } from "@/lib/reprise/adapters/shared/prompts-extraction";
import { detecterCoucheTexte } from "@/lib/reprise/adapters/pdf/detecter-couche-texte";

const MODEL_PATRIMOINE = process.env.CLAUDE_MODEL_PATRIMOINE || "claude-sonnet-4-6";
const MODEL_PROPRIETAIRES = process.env.CLAUDE_MODEL_PROPRIETAIRES || "claude-haiku-4-5";
const INFERENCE_GEO = process.env.CLAUDE_INFERENCE_GEO; // optionnel (undefined = non envoye)
const MAX_TOKENS = 16000;

function client(): Anthropic {
  // Client zero-arg : le SDK resout les credentials dans l'ordre ANTHROPIC_API_KEY ->
  // ANTHROPIC_AUTH_TOKEN -> profil OAuth `ant auth login` (session Claude). Permet donc
  // d'utiliser une cle API OU une session (plan Max) sans changer de code. Si aucune
  // credential n'est disponible, le SDK leve l'erreur au moment de l'appel.
  return new Anthropic();
}

/**
 * Construit les blocs de contenu utilisateur : texte extrait si PDF natif (tokens texte,
 * moins cher), sinon le PDF en document base64 (Claude OCR-ise via vision).
 */
async function blocsDocuments(docs: DocumentSource[]): Promise<Anthropic.ContentBlockParam[]> {
  const blocs: Anthropic.ContentBlockParam[] = [];
  for (const d of docs) {
    const analyse = await detecterCoucheTexte(d.contenu);
    if (analyse.natif) {
      blocs.push({ type: "text", text: `### DOCUMENT : ${d.nom} (couche texte native)\n\n${analyse.texte}` });
    } else {
      blocs.push({ type: "text", text: `### DOCUMENT : ${d.nom} (scanne)` });
      blocs.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: Buffer.from(d.contenu).toString("base64") },
      });
    }
  }
  return blocs;
}

async function extraire(systeme: string, model: string, docs: DocumentSource[]): Promise<unknown> {
  const blocs = await blocsDocuments(docs);
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    system: systeme,
    messages: [
      { role: "user", content: [...blocs, { type: "text", text: "Produis le JSON demande, uniquement." }] },
    ],
  };
  // inference_geo optionnel + non type dans toutes les versions du SDK : cast au besoin.
  const params = (INFERENCE_GEO ? { ...base, inference_geo: INFERENCE_GEO } : base) as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const resp = await client().messages.create(params);
  const texte = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(extraireJson(texte));
}

export class ClaudeExtractionProvider implements ExtractionProvider {
  async extrairePatrimoine(docs: DocumentSource[]): Promise<ResultatPatrimoine> {
    return normaliserPatrimoine(await extraire(SYSTEME_PATRIMOINE, MODEL_PATRIMOINE, docs));
  }

  async extraireProprietaires(docs: DocumentSource[]): Promise<ResultatProprietaires> {
    return normaliserProprietaires(await extraire(SYSTEME_PROPRIETAIRES, MODEL_PROPRIETAIRES, docs));
  }
}
