// Outil du triage hebdomadaire des remontees (skill /corrections). Lit et ecrit
// intranet_feedback via service_role (.env.local). AUCUNE suppression possible ici.
//
// Usage (depuis la racine du repo) :
//   node scripts/feedback-triage.mjs liste [--tous]        # actives (ou tout)
//   node scripts/feedback-triage.mjs voir <id>             # detail complet d'une remontee
//   node scripts/feedback-triage.mjs maj <id> champ=valeur [champ=valeur...]
//
// Champs acceptes par `maj` :
//   statut=nouveau|prevu|en_cours|livre|ecarte   (livre pose livre_at ; ecarte EXIGE raison=...)
//   titre="..."  resume="..."  severite=bloquant|genant|confort
//   priorite=<entier|vide>  note="..."  raison="..."
// Le titre et le resume sont PUBLICS (vitrine /nouveautes) : langage simple, jamais
// la description interne. La description du collaborateur n'est PAS modifiable ici
// (c'est sa parole ; la reformulation publique passe par titre + resume).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TABLE = "intranet_feedback";
const STATUTS = ["nouveau", "prevu", "en_cours", "livre", "ecarte"];
const SEVERITES = ["bloquant", "genant", "confort"];

const [, , commande, ...args] = process.argv;

function fatal(msg) {
  console.error(`ERREUR : ${msg}`);
  process.exit(1);
}

if (commande === "liste") {
  const tous = args.includes("--tous");
  const colsBase = "id, type, titre, statut, severite, priorite, page, auteur_initiales, created_at, archive_at";
  // Lecture degradee tant que le SQL resume_public n'est pas passe.
  let r = await sb.from(TABLE).select(`${colsBase}, resume_public`).order("created_at", { ascending: false });
  if (r.error && /resume_public/.test(r.error.message)) {
    console.error("NB : colonne resume_public absente - SQL a passer : supabase/sql/intranet_feedback_resume_public.sql");
    r = await sb.from(TABLE).select(colsBase).order("created_at", { ascending: false });
  }
  const { data, error } = r;
  if (error) fatal(error.message);
  const lignes = tous
    ? data
    : data.filter((f) => !f.archive_at && !["livre", "ecarte"].includes(f.statut));
  for (const f of lignes) {
    const marqueurs = [f.statut, f.type, f.severite ?? "-", f.priorite ?? "-", f.auteur_initiales ?? "?", f.created_at.slice(0, 10)];
    const resume = f.resume_public ? " [resume OK]" : "";
    console.log(`${f.id} | [${marqueurs.join("|")}]${resume} ${f.titre.slice(0, 100)}`);
  }
  console.log(`\n${lignes.length} remontee(s).`);
} else if (commande === "voir") {
  const id = args[0] ?? fatal("id manquant");
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) fatal(error.message);
  if (!data) fatal("introuvable");
  // L'email de l'auteur ne sort pas (PII) : les initiales suffisent au triage.
  const { auteur_email: _email, ...reste } = data;
  console.log(JSON.stringify(reste, null, 2));
} else if (commande === "maj") {
  const id = args[0] ?? fatal("id manquant");
  const patch = { updated_at: new Date().toISOString() };
  for (const arg of args.slice(1)) {
    const i = arg.indexOf("=");
    if (i < 1) fatal(`argument illisible : ${arg}`);
    const cle = arg.slice(0, i);
    const val = arg.slice(i + 1);
    if (cle === "statut") {
      if (!STATUTS.includes(val)) fatal(`statut inconnu : ${val}`);
      patch.statut = val;
      if (val === "livre") patch.livre_at = new Date().toISOString();
      if (val !== "ecarte") patch.raison_ecart = null;
    } else if (cle === "titre") patch.titre = val;
    else if (cle === "resume") patch.resume_public = val || null;
    else if (cle === "severite") {
      if (!SEVERITES.includes(val)) fatal(`severite inconnue : ${val}`);
      patch.severite = val;
    } else if (cle === "priorite") patch.priorite = val === "" ? null : Number(val);
    else if (cle === "note") patch.note_interne = val;
    else if (cle === "raison") patch.raison_ecart = val;
    else fatal(`champ inconnu : ${cle}`);
  }
  if (patch.statut === "ecarte" && !patch.raison_ecart) fatal("ecarter EXIGE raison=...");
  const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("id, titre, statut").maybeSingle();
  if (error) fatal(error.message);
  if (!data) fatal("introuvable");
  console.log(`OK : ${data.id} -> ${data.statut} | ${data.titre.slice(0, 80)}`);
} else {
  fatal("commande inconnue (liste | voir | maj)");
}
