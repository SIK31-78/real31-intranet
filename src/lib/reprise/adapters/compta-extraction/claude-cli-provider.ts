// Adapter CLI Claude Code du port ExtractionComptaProvider - mode TEST, sans cle API.
// Meme approche que l'adapter CLI patrimoine : ecrit les PDF en dossier temporaire, demande
// a `claude -p` de les LIRE (outil Read, vision pour les scans) et de produire le JSON, puis
// nettoie. Aucune dependance npm (child_process natif). RESERVE AUX TESTS (limites du plan) ;
// en prod, la cle API (adapter Claude/Mistral SDK) est la bonne voie. Meme prompt + normaliseur
// + auto-checks que le SDK : le filet deterministe rattrape les erreurs quel que soit le moteur.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import { SYSTEME_GRAND_LIVRE, extraireJson } from "@/lib/reprise/adapters/shared/prompts-compta";

const BIN = process.env.CLAUDE_CLI_BIN || "claude";
// La CLI attend un alias de modele (sonnet / haiku / opus), pas l'id complet du SDK.
const MODEL_COMPTA = process.env.CLAUDE_CLI_MODEL_COMPTA || "sonnet";
const TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS || 300_000);

// Nom de fichier sur pour le temp dir (garde l'extension .pdf).
function nomSafe(nom: string): string {
  const base = nom.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "doc";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

// Lance `claude -p` en headless (prompt via stdin), renvoie la sortie texte ou throw.
function lancer(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // On RETIRE ANTHROPIC_API_KEY / AUTH_TOKEN de l'env du sous-processus : sinon la CLI
    // utiliserait la cle API (metree) au lieu de la session Max locale voulue en mode CLI.
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const child = spawn(BIN, args, { shell: process.platform === "win32", env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Extraction CLI : delai depasse (la CLI n'a pas repondu a temps)."));
    }, TIMEOUT_MS);
    child.stdout.on("data", (b) => (out += b.toString()));
    child.stderr.on("data", (b) => (err += b.toString()));
    child.on("error", (e) =>
      reject(
        new Error(
          `CLI 'claude' introuvable ou erreur de lancement : ${e.message}. Verifie qu'elle est installee et qu'une session est ouverte.`,
        ),
      ),
    );
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`Extraction CLI : code ${code}. ${err.slice(0, 300)}`));
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

export class ClaudeCliComptaExtractionProvider implements ExtractionComptaProvider {
  async extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures> {
    const dir = await mkdtemp(join(tmpdir(), "reprise-compta-cli-"));
    try {
      const chemins: string[] = [];
      for (const d of docs) {
        const p = join(dir, nomSafe(d.nom));
        await writeFile(p, d.contenu);
        chemins.push(p);
      }
      const prompt = [
        SYSTEME_GRAND_LIVRE,
        "",
        "Lis attentivement les documents PDF suivants (chemins exacts, utilise l'outil Read) :",
        ...chemins.map((c) => `- ${c}`),
        "",
        "Produis le JSON demande par les regles ci-dessus, UNIQUEMENT le JSON (aucun texte, aucun commentaire).",
      ].join("\n");

      const args = ["-p", "--model", MODEL_COMPTA, "--allowedTools", "Read", "--add-dir", dir, "--output-format", "text"];
      const sortie = await lancer(args, prompt);
      return normaliserGrandLivre(JSON.parse(extraireJson(sortie)));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
