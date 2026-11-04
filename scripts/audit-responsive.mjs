#!/usr/bin/env node
// Audit responsive (REA-497) : ouvre chaque page de l'intranet en largeur telephone,
// mesure ce qui deborde / s'ecrase / se tronque, et sort un rapport classe par gravite.
//
// LECTURE SEULE : le script ne fait que naviguer (GET) et mesurer. Il ne clique sur rien,
// et toute requete autre que GET/HEAD/OPTIONS emise par une page est avortee. Il peut donc
// viser un serveur local ou la prod, mais la prod se lance a la main, avec VOTRE session.
//
// 1) Produire la session une fois (fenetre visible, vous vous connectez vous-meme) :
//      node scripts/audit-responsive.mjs --connexion --base https://<prod-ou-local>
//    La fenetre s'ouvre sur l'intranet ; connectez-vous (Entra ID), attendez d'etre sur
//    l'accueil, puis FERMEZ la fenetre. L'etat est enregistre toutes les 2 s pendant la
//    session et a la fermeture, dans --etat (defaut : audit-responsive-etat.json).
//    Ce fichier contient vos cookies : il est dans .gitignore, ne le commitez ni ne le
//    partagez jamais, supprimez-le apres l'audit.
//
// 2) Lancer l'audit :
//      node scripts/audit-responsive.mjs --base https://<prod-ou-local> --etat audit-responsive-etat.json
//
// Options :
//   --base <url>      serveur vise (defaut http://localhost:3000)
//   --etat <fichier>  storageState Playwright (session), jamais commite
//   --largeur <px>    largeur du viewport (defaut 390)
//   --pages <a,b>     ne garde que les routes contenant l'une de ces sous-chaines
//   --sortie <dos>    dossier de sortie (defaut audit-responsive-sortie/, ignore par git)
//   --connexion       mode creation de session (voir plus haut)
//
// Routes : lues dans src/app/**/page.tsx. Les routes dynamiques ([id]...) ne sont mesurees
// que si scripts/audit-responsive.routes.json leur donne un id d'exemple.
//
// Sortie : <sortie>/<date>/rapport.md, rapport.json, captures/*.png (pleine page).
// Code de sortie : 1 s'il y a du bloquant (debordement horizontal, element a largeur nulle),
// 2 si seulement des pages n'ont pas pu etre mesurees (session expiree, HTTP >= 400), 0 sinon.
//
// Navigateur : comme src/lib/services/pdf/rendre-pdf.ts, le Chrome installe, ou CHROME_PATH.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  classer,
  codeSortie,
  listerRoutes,
  mesurerPage,
  nomCapture,
  planifier,
  rapportMarkdown,
  synthese,
} from "./lib/audit-responsive.mjs";

const args = process.argv.slice(2);
function option(nom, defaut) {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : defaut;
}

const base = option("base", "http://localhost:3000").replace(/\/+$/, "");
const fichierEtat = option("etat", "audit-responsive-etat.json");
const largeur = Number(option("largeur", "390"));
const filtre = option("pages", "");
const dossierSortie = option("sortie", "audit-responsive-sortie");
const modeConnexion = args.includes("--connexion");
const HAUTEUR = 844;
const SEUIL_TACTILE = 32;

async function lancerNavigateur(headless) {
  const { chromium } = await import("playwright-core");
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath, headless } : { channel: "chrome", headless });
}

async function connexion() {
  const navigateur = await lancerNavigateur(false);
  const contexte = await navigateur.newContext({ viewport: null });
  const page = await contexte.newPage();
  let ferme = false;
  const sauver = async () => {
    try {
      const etat = await contexte.storageState();
      if (etat.cookies.length > 0) writeFileSync(fichierEtat, JSON.stringify(etat));
    } catch {
      /* contexte deja ferme : on garde la derniere sauvegarde */
    }
  };
  const minuterie = setInterval(() => {
    if (!ferme) void sauver();
  }, 2000);
  page.on("close", async () => {
    await sauver();
  });
  navigateur.on("disconnected", () => {
    ferme = true;
    clearInterval(minuterie);
  });
  await page.goto(base).catch(() => {});
  console.log(`Connectez-vous dans la fenetre ouverte sur ${base}, puis fermez-la. Etat enregistre dans ${fichierEtat}.`);
  await new Promise((resolve) => navigateur.on("disconnected", resolve));
  console.log(existsSync(fichierEtat) ? `Session enregistree : ${fichierEtat} (ne la commitez pas).` : "Aucune session enregistree.");
}

async function auditer() {
  if (!existsSync(fichierEtat) && !/^https?:\/\/localhost[:/]/.test(base + "/")) {
    console.error(`Etat de session introuvable (${fichierEtat}). Creez-le avec --connexion.`);
    process.exit(2);
  }
  const config = existsSync("scripts/audit-responsive.routes.json")
    ? JSON.parse(readFileSync("scripts/audit-responsive.routes.json", "utf8"))
    : {};
  const { aAuditer, ignorees } = planifier(listerRoutes("src/app"), config, filtre);
  if (aAuditer.length === 0) {
    console.error("Aucune page a auditer (filtre trop strict, ou routes dynamiques sans id).");
    process.exit(2);
  }

  const horodatage = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dossier = join(dossierSortie, horodatage);
  mkdirSync(join(dossier, "captures"), { recursive: true });

  const navigateur = await lancerNavigateur(true);
  const contexte = await navigateur.newContext({
    viewport: { width: largeur, height: HAUTEUR },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    ...(existsSync(fichierEtat) ? { storageState: fichierEtat } : {}),
  });
  // Garde-fou lecture seule : aucune requete qui ecrit ne part d'ici.
  await contexte.route("**/*", (route) =>
    ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort(),
  );

  const resultats = [];
  const hoteBase = new URL(base).host;
  for (const { route, chemin } of aAuditer) {
    const page = await contexte.newPage();
    const entree = { route, chemin };
    try {
      const reponse = await page.goto(base + chemin, { waitUntil: "load", timeout: 30000 });
      entree.statut = reponse?.status();
      const urlFinale = new URL(page.url());
      entree.redirigeeVersConnexion =
        urlFinale.host !== hoteBase || /\/(api\/auth|login|signin|connexion)\b/.test(urlFinale.pathname);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await page.evaluate(() => document.fonts?.ready).catch(() => {});
      await page.waitForTimeout(500);
      if (!entree.redirigeeVersConnexion && !(entree.statut >= 400)) {
        entree.mesure = await page.evaluate(mesurerPage, { seuilTactile: SEUIL_TACTILE, max: 15 });
      }
      const fichier = `${nomCapture(chemin)}.png`;
      await page.screenshot({ path: join(dossier, "captures", fichier), fullPage: true }).catch(() => {});
      entree.capture = `captures/${fichier}`;
    } catch (e) {
      entree.erreur = e instanceof Error ? e.message.split("\n")[0] : String(e);
    } finally {
      await page.close();
    }
    const classe = classer(entree);
    resultats.push(classe);
    console.log(`${classe.gravite.padEnd(8)} ${route}`);
  }
  await navigateur.close();

  const meta = { base, largeur, date: new Date().toISOString(), ignorees };
  writeFileSync(join(dossier, "rapport.md"), rapportMarkdown(resultats, meta));
  writeFileSync(join(dossier, "rapport.json"), JSON.stringify({ meta, synthese: synthese(resultats), resultats }, null, 2));
  const s = synthese(resultats);
  console.log(`\n${s.pages} pages : ${s.bloquant} bloquantes, ${s.genant} gênantes, ${s.info} info, ${s.ok} propres. ${ignorees.length} ignorées.`);
  console.log(`Rapport : ${join(dossier, "rapport.md")}`);
  process.exit(codeSortie(resultats));
}

if (modeConnexion) await connexion();
else await auditer();
