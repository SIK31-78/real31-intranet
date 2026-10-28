// Adapter Anthropic de la reformulation (28/10/2026, ADR-051) : un seul appel Messages, sans
// outil, consignes en system, brouillon encapsulé dans le message. API directe, clé
// ANTHROPIC_API_KEY (crédits du plan Teams). Les erreurs du SDK deviennent des
// ErreurReformulation à code court : le service en fait un message en français et le journal
// d'usage les compte, sans jamais rien garder du texte.
//
// Le SDK installé (0.69) ne connaît pas encore `output_config`, le mode de réflexion
// `between_tools` ni `fallbacks` : ils sont envoyés tels quels (l'API les accepte, essai du
// 28/10/2026), d'où la conversion de type au moment de l'appel.

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  ErreurReformulation,
  type DemandeReformulation,
  type FinReformulation,
  type ReformulationProvider,
  type ReponseReformulation,
} from "@/lib/ports/reformulation-provider";

/** Modèles qui acceptent le repli côté serveur en cas de refus (`fallbacks: "default"`). */
const AVEC_REPLI = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);
const BETA_REPLI = "server-side-fallback-2026-07-01";

/**
 * Les réglages qui dépendent du modèle. Reformuler ne demande pas de réflexion : effort bas, et
 * sur Sonnet 5.5 la réflexion coupée (`between_tools` sans outil = aucune réflexion). La
 * température n'est pas réglable sur ces modèles (une valeur non par défaut est refusée).
 */
export function parametresAppel(d: DemandeReformulation): Record<string, unknown> {
  const p: Record<string, unknown> = {
    model: d.modele,
    max_tokens: d.maxTokens,
    system: d.systeme,
    messages: [{ role: "user", content: d.message }],
    output_config: { effort: "low" },
  };
  if (d.modele === "claude-sonnet-5-5") p.thinking = { type: "between_tools" };
  if (AVEC_REPLI.has(d.modele)) {
    p.betas = [BETA_REPLI];
    p.fallbacks = "default";
  }
  return p;
}

function finDe(stop: string | null | undefined): FinReformulation {
  if (stop === "refusal") return "refus";
  if (stop === "max_tokens") return "coupe";
  return "termine";
}

/** L'erreur du SDK, rangée par code. Le message garde le statut HTTP, jamais le texte envoyé. */
export function erreurDepuis(e: unknown): ErreurReformulation {
  if (e instanceof ErreurReformulation) return e;
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new ErreurReformulation("delai", "Anthropic : délai dépassé");
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new ErreurReformulation("configuration", `Anthropic : clé refusée (${e.status})`);
  }
  if (e instanceof Anthropic.RateLimitError) return new ErreurReformulation("saturation", "Anthropic : limite de débit (429)");
  if (e instanceof Anthropic.APIError) {
    const texte = String(e.message ?? "");
    // Crédits épuisés : l'API répond 400 « credit balance is too low ».
    if (/credit balance|billing/i.test(texte)) return new ErreurReformulation("credit", `Anthropic : crédits épuisés (${e.status})`);
    if (e.status === 529 || e.status === 503) return new ErreurReformulation("saturation", `Anthropic : service saturé (${e.status})`);
    return new ErreurReformulation("api", `Anthropic : erreur ${e.status ?? "réseau"}`);
  }
  return new ErreurReformulation("api", "Anthropic : erreur inattendue");
}

export class AnthropicReformulationProvider implements ReformulationProvider {
  readonly nom = "anthropic";
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 0 });
  }

  async reformuler(d: DemandeReformulation): Promise<ReponseReformulation> {
    try {
      const r = await this.client.beta.messages.create(
        parametresAppel(d) as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        { timeout: d.delaiMs, maxRetries: 0 },
      );
      const texte = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return {
        texte,
        fin: finDe(r.stop_reason),
        tokensEntree: r.usage.input_tokens ?? 0,
        tokensSortie: r.usage.output_tokens ?? 0,
        modele: r.model ?? d.modele,
      };
    } catch (e) {
      throw erreurDepuis(e);
    }
  }
}
