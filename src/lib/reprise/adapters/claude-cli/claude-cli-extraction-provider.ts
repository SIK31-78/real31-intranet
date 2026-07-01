// Adapter CLI Claude Code du port ExtractionProvider - mode TEST, sans cle API.
//
// Utilise la CLI `claude -p` (session de l'utilisateur, ex. plan Max) au lieu du SDK : ecrit
// les PDF dans un dossier temporaire, demande a la CLI de les LIRE (outil Read, vision pour
// les scans) et de produire le JSON, puis nettoie. Aucune dependance npm (child_process natif).
//
// RESERVE AUX TESTS : les limites d'usage du plan s'appliquent, et faire tourner l'extraction
// via la CLI n'est pas fait pour la prod/le scale -> une cle API dediee (adapter Claude/Mistral
// SDK) est la bonne voie en production. On garde le meme port + les memes prompts/normaliseur.
// Le meme filet d'auto-checks deterministes rattrape les erreurs quel que soit le moteur.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DocumentSource,
  ExtractionProvider,
  ResultatPatrimoine,
  ResultatProprietaires,
} from "@/lib/reprise/ports/extraction-provider";
import { normaliserPatrimoine, normaliserProprietaires } from "@/lib/reprise/adapters/shared/normaliser";
import { SYSTEME_PATRIMOINE, SYSTEME_PROPRIETAIRES, extraireJson } from "@/lib/reprise/adapters/shared/prompts-extraction";

const BIN = process.env.CLAUDE_CLI_BIN || "claude";
// La CLI attend des alias de modele (sonnet / haiku / opus), pas les ids complets du SDK.
const MODEL_PATRIMOINE = process.env.CLAUDE_CLI_MODEL_PATRIMOINE || "sonnet";
const MODEL_PROPRIETAIRES = process.env.CLAUDE_CLI_MODEL_PROPRIETAIRES || "haiku";
const TIMEOUT_MS = Number(process.env.CLAUDE_CLI_TIMEOUT_MS || 300_000);

// Nom de fichier sur pour le temp dir (garde l'extension .pdf).
function nomSafe(nom: string): string {
  const base = nom.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "doc";
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

// Lance `claude -p` en headless (prompt via stdin), renvoie la sortie texte ou throw.
function lancer(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, args, { shell: process.platform === "win32" });
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

// Ecrit les docs en temp, invoque la CLI, parse le JSON, nettoie (finally).
async function extraire(systeme: string, model: string, docs: DocumentSource[]): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "reprise-cli-"));
  try {
    const chemins: string[] = [];
    for (const d of docs) {
      const p = join(dir, nomSafe(d.nom));
      await writeFile(p, d.contenu);
      chemins.push(p);
    }
    // Les regles cabinet (systeme) passent en preambule du message utilisateur : la CLI garde
    // son prompt Claude Code par defaut, mais l'instruction + le "JSON uniquement" suffisent, et
    // extraireJson tolere un eventuel bloc markdown ou du texte autour.
    const prompt = [
      systeme,
      "",
      "Lis attentivement les documents PDF suivants (chemins exacts, utilise l'outil Read) :",
      ...chemins.map((c) => `- ${c}`),
      "",
      "Produis le JSON demande par les regles ci-dessus, UNIQUEMENT le JSON (aucun texte, aucun commentaire).",
    ].join("\n");

    const args = ["-p", "--model", model, "--allowedTools", "Read", "--add-dir", dir, "--output-format", "text"];
    const sortie = await lancer(args, prompt);
    return JSON.parse(extraireJson(sortie));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export class ClaudeCliExtractionProvider implements ExtractionProvider {
  async extrairePatrimoine(docs: DocumentSource[]): Promise<ResultatPatrimoine> {
    return normaliserPatrimoine(await extraire(SYSTEME_PATRIMOINE, MODEL_PATRIMOINE, docs));
  }

  async extraireProprietaires(docs: DocumentSource[]): Promise<ResultatProprietaires> {
    return normaliserProprietaires(await extraire(SYSTEME_PROPRIETAIRES, MODEL_PROPRIETAIRES, docs));
  }
}
