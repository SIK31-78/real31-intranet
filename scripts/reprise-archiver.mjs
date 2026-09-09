// ============================================================================
// reprise-archiver.mjs — sort le dossier de travail d'une reprise du dossier de
// la copropriete (SharePoint) et le range dans reprise/<REF>/ a la racine du repo.
//
//   node scripts/reprise-archiver.mjs S0305 "C:\Users\...\Syndic - LGC\Gaultier 4\Reprise"
//   node scripts/reprise-archiver.mjs S0305 "<dossier Reprise>" --simulation
//
// Ce qui bouge : le sous-dossier `travail/` (scripts, JSON d'extraction, controles).
// Ce qui reste dans le dossier de la copro : les livrables de la gestionnaire
// (0x-*.md, *_mapping-reprise.xlsx, entries_*.xlsx, eclatement.xlsx, od_*.xlsx).
//
// Regles : deplace (pas de copie) ; refuse d'ecraser une archive existante ;
// ecrit un ARCHIVE.md dans la destination avec l'origine et la date.
// reprise/ est hors depot (.gitignore).
// ============================================================================
import { existsSync, mkdirSync, renameSync, cpSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const [ref, source, flag] = process.argv.slice(2);
const SIMULATION = flag === "--simulation";
if (!ref || !source || !/^S[0-9E]{4}$/.test(ref)) {
  console.error("usage : node scripts/reprise-archiver.mjs <REF S0XXX> <dossier Reprise de la copro> [--simulation]");
  process.exit(2);
}

const racine = resolve(fileURLToPath(new URL("..", import.meta.url)));
const src = resolve(source, "travail");
const dstDir = join(racine, "reprise", ref);
const dst = join(dstDir, "travail");

if (!existsSync(src)) { console.error(`introuvable : ${src}`); process.exit(3); }
if (existsSync(dst)) { console.error(`deja archive : ${dst} — on n'ecrase pas.`); process.exit(4); }

const compter = (d) => readdirSync(d).reduce((n, f) => {
  const p = join(d, f); return n + (statSync(p).isDirectory() ? compter(p) : 1); }, 0);
const nb = compter(src);
console.log(`${SIMULATION ? "--- SIMULATION ---" : "*** DEPLACEMENT ***"}\n   ${src}\n   -> ${dst}\n   ${nb} fichier(s)`);
if (SIMULATION) process.exit(0);

mkdirSync(dstDir, { recursive: true });
try {
  renameSync(src, dst);                          // meme volume : instantane
} catch {
  cpSync(src, dst, { recursive: true });         // volumes differents (SharePoint -> C:) : copie puis suppression
  rmSync(src, { recursive: true, force: true });
}
writeFileSync(join(dstDir, "ARCHIVE.md"),
  `# ${ref} — dossier de travail archive\n\nOrigine : ${src}\nArchive le : ${new Date().toISOString().slice(0, 10)}\nFichiers : ${nb}\n\nLes livrables de la gestionnaire sont restes dans ${resolve(source)}.\n`);
console.log(`   fait — ${compter(dst)} fichier(s) dans ${dst}`);
