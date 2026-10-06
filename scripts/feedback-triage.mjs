// Outil du triage hebdomadaire des remontees (skill /corrections). Lit et ecrit
// intranet_feedback via service_role (.env.local). AUCUNE suppression possible ici.
//
// Usage (depuis la racine du repo) :
//   node scripts/feedback-triage.mjs liste [--tous]        # actives (ou tout)
//   node scripts/feedback-triage.mjs voir <id>             # detail complet d'une remontee
//   node scripts/feedback-triage.mjs maj <id> champ=valeur [champ=valeur...]
//   node scripts/feedback-triage.mjs creer type=bug titre="..." description="..." [champ=...]
//
// `creer` sert aux remontees qui n'arrivent PAS par le bouton « Un bug / une idee » :
// un mail, un appel, un post-it. La description reste la parole de celui qui signale,
// recopiee telle quelle ; l'auteur se donne par ses initiales, jamais par son email.
//
// DEPUIS LE PONT LINEAR (ADR-043, 2026-10-06) : le STATUT est porte par LINEAR.
// `maj <id> statut=...` est REFUSE des que la remontee a un ticket, et le script dit
// ou aller. Sans ce refus, le cron de 6h relirait l etat du ticket (reste en Backlog)
// et ecraserait le triage de la nuit - silencieusement. Ce qui reste ici : titre,
// resume public, severite, note. Linear ne sait pas faire le resume de la vitrine.
//
// Champs acceptes par `maj` :
//   statut=nouveau|prevu|en_cours|livre|ecarte   (livre pose livre_at ; ecarte EXIGE raison=...)
//                                               REFUSE si la remontee a un ticket Linear
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
  const colsBase = "id, type, titre, statut, severite, priorite, page, auteur_initiales, created_at, archive_at, linear_identifier";
  // Lecture degradee tant que le SQL resume_public n'est pas passe.
  let r = await sb.from(TABLE).select(`${colsBase}, resume_public`).order("created_at", { ascending: false });
  if (r.error && /linear_identifier/.test(r.error.message)) {
    console.error("NB : colonnes Linear absentes - SQL a passer : supabase/sql/intranet_feedback_linear.sql");
    r = await sb
      .from(TABLE)
      .select(`${colsBase.replace(", linear_identifier", "")}, resume_public`)
      .order("created_at", { ascending: false });
  }
  if (r.error && /resume_public/.test(r.error.message)) {
    console.error("NB : colonne resume_public absente - SQL a passer : supabase/sql/intranet_feedback_resume_public.sql");
    r = await sb
      .from(TABLE)
      .select(colsBase.replace(", linear_identifier", ""))
      .order("created_at", { ascending: false });
  }
  const { data, error } = r;
  if (error) fatal(error.message);
  const lignes = tous
    ? data
    : data.filter((f) => !f.archive_at && !["livre", "ecarte"].includes(f.statut));
  for (const f of lignes) {
    const marqueurs = [f.statut, f.type, f.severite ?? "-", f.priorite ?? "-", f.auteur_initiales ?? "?", f.created_at.slice(0, 10)];
    const resume = f.resume_public ? " [resume OK]" : "";
    // L identifiant Linear dit OU statuer : present = le statut se change la-bas.
    const ticket = f.linear_identifier ? ` <${f.linear_identifier}>` : "";
    console.log(`${f.id} | [${marqueurs.join("|")}]${resume}${ticket} ${f.titre.slice(0, 100)}`);
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
} else if (commande === "creer") {
  const champs = { type: "bug", statut: "nouveau" };
  for (const arg of args) {
    const i = arg.indexOf("=");
    if (i < 1) fatal(`argument illisible : ${arg}`);
    const cle = arg.slice(0, i);
    const val = arg.slice(i + 1);
    if (cle === "type") {
      if (!["bug", "idee"].includes(val)) fatal(`type inconnu : ${val} (bug | idee)`);
      champs.type = val;
    } else if (cle === "titre") champs.titre = val;
    else if (cle === "description") champs.description = val;
    else if (cle === "page") champs.page = val;
    else if (cle === "auteur") champs.auteur_initiales = val;
    else if (cle === "severite") {
      if (!SEVERITES.includes(val)) fatal(`severite inconnue : ${val}`);
      champs.severite = val;
    } else if (cle === "statut") {
      if (!STATUTS.includes(val)) fatal(`statut inconnu : ${val}`);
      champs.statut = val;
      if (val === "livre") champs.livre_at = new Date().toISOString();
    } else if (cle === "priorite") champs.priorite = val === "" ? null : Number(val);
    else if (cle === "resume") champs.resume_public = val || null;
    else if (cle === "note") champs.note_interne = val;
    else fatal(`champ inconnu : ${cle}`);
  }
  if (!champs.titre) fatal("titre= manquant");
  if (!champs.description) fatal("description= manquante (la parole de celui qui signale)");
  if (champs.auteur_initiales && champs.auteur_initiales.includes("@")) fatal("auteur= prend des INITIALES, pas un email");
  const { data, error } = await sb.from(TABLE).insert(champs).select("id, titre, statut").maybeSingle();
  if (error) fatal(error.message);
  console.log(`CREEE : ${data.id} -> ${data.statut} | ${data.titre.slice(0, 80)}`);
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

  // LE garde-fou du pont : le statut d une remontee deja poussee se change DANS
  // LINEAR, sinon le cron l ecrase a 6h. On lit l etat courant avant d ecrire.
  if (patch.statut) {
    const sonde = await sb.from(TABLE).select("linear_issue_id, linear_identifier").eq("id", id).maybeSingle();
    // Colonnes absentes (SQL pas passe) = pas de pont : on laisse passer.
    if (!sonde.error && sonde.data?.linear_issue_id) {
      fatal(
        `statut= refuse : cette remontee est suivie par le ticket ${sonde.data.linear_identifier}.
` +
          `  Le STATUT est porte par Linear (ADR-043) : change l etat du ticket la-bas,
` +
          `  le cron de 6h realignera la remontee. Ici tu peux encore poser
` +
          `  titre= resume= severite= note= priorite=.`,
      );
    }
  }
  const { data, error } = await sb.from(TABLE).update(patch).eq("id", id).select("id, titre, statut").maybeSingle();
  if (error) fatal(error.message);
  if (!data) fatal("introuvable");
  console.log(`OK : ${data.id} -> ${data.statut} | ${data.titre.slice(0, 80)}`);
} else {
  fatal("commande inconnue (liste | voir | creer | maj)");
}
