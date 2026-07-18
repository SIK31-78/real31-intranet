// Adapter Claude (Anthropic) du port ExtractionComptaProvider. Meme infra que l'extraction
// PATRIMOINE (claude-extraction-provider) : PDF envoyes en bloc document base64 (Claude lit
// nativement le texte ET OCR-ise les scans par vision, pas de librairie OCR), client SDK
// zero-arg (cle API OU session Max), extraction du JSON. Le SDK @anthropic-ai/sdk est CONFINE
// ici. Un seul appel (le grand livre est une mission unique), modele CLAUDE_MODEL_COMPTA.

import Anthropic from "@anthropic-ai/sdk";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import { SYSTEME_GRAND_LIVRE, extraireJson } from "@/lib/reprise/adapters/shared/prompts-compta";

// Le grand livre est une tache structurelle dure (beaucoup de lignes, mise en page variable)
// -> modele de la gamme "sonnet" par defaut, surchargeable par env.
const MODEL_COMPTA = process.env.CLAUDE_MODEL_COMPTA || "claude-sonnet-4-6";
const MAX_TOKENS = 16000;

function client(): Anthropic {
  // Client zero-arg : le SDK resout ANTHROPIC_API_KEY -> ANTHROPIC_AUTH_TOKEN -> profil OAuth.
  return new Anthropic();
}

/** Chaque PDF est envoye comme document base64 (cf. adapter patrimoine : on evite unpdf). */
function blocsDocuments(docs: DocumentSource[]): Anthropic.ContentBlockParam[] {
  const blocs: Anthropic.ContentBlockParam[] = [];
  for (const d of docs) {
    blocs.push({ type: "text", text: `### DOCUMENT : ${d.nom}` });
    blocs.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: Buffer.from(d.contenu).toString("base64") },
    });
  }
  return blocs;
}

export class ClaudeComptaExtractionProvider implements ExtractionComptaProvider {
  async extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures> {
    const blocs = blocsDocuments(docs);
    const resp = await client().messages.create({
      model: MODEL_COMPTA,
      max_tokens: MAX_TOKENS,
      system: SYSTEME_GRAND_LIVRE,
      messages: [{ role: "user", content: [...blocs, { type: "text", text: "Produis le JSON demande, uniquement." }] }],
    });
    const texte = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return normaliserGrandLivre(JSON.parse(extraireJson(texte)));
  }
}
