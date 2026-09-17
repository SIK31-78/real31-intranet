// Service PDF : un HTML A4 autonome -> un PDF, par Chromium (Sekou, 17/09/2026 : « DocumentPrintView
// -> Playwright -> PDF »). Deux moteurs selon l'endroit :
//   - sur Vercel (AWS_LAMBDA / VERCEL) : @sparticuz/chromium, un Chromium allege pour Lambda ;
//   - sur un poste : le Chrome installe (channel "chrome"), ou CHROME_PATH.
// Un seul navigateur par instance, ouvert a la demande et garde pour les appels suivants.
// L'ADR-012 (« page imprimable, pas de PDF serveur ») est amendee par ce service : l'offre
// doit partir par mail avec le contrat en piece jointe, il faut des octets.

import "server-only";
import type { Browser } from "playwright-core";

let navigateur: Promise<Browser> | null = null;

// playwright-core et @sparticuz/chromium ne se chargent qu'au premier PDF : un module qui
// manque sur la fonction ne doit pas faire tomber la route entiere au chargement (500 muet
// sur Vercel le 17/09), il doit donner un message.
const SUR_LAMBDA = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function ouvrir(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (SUR_LAMBDA) {
    const sparticuz = (await import("@sparticuz/chromium")).default;
    // Les arguments de @sparticuz/chromium sont pensés pour Puppeteer : avec Playwright,
    // `--single-process` fait tomber la page dès newPage (« Target page, context or browser
    // has been closed », prod du 17/09) et `--headless='shell'` double le mode headless que
    // Playwright pose lui-même. On les retire.
    const args = sparticuz.args.filter((a) => a !== "--single-process" && !a.startsWith("--headless"));
    return chromium.launch({ args, executablePath: await sparticuz.executablePath(), headless: true, chromiumSandbox: false });
  }
  const executablePath = process.env.CHROME_PATH;
  return chromium.launch(executablePath ? { executablePath, headless: true } : { channel: "chrome", headless: true });
}

async function navigateurPartage(): Promise<Browser> {
  if (!navigateur) {
    navigateur = ouvrir().catch((e) => {
      navigateur = null;
      throw e;
    });
  }
  const b = await navigateur;
  if (!b.isConnected()) {
    navigateur = null;
    return navigateurPartage();
  }
  return b;
}

/** Rend un HTML complet (avec son CSS et sa regle @page) en PDF. */
export async function rendrePdf(html: string): Promise<Buffer> {
  // Sur la fonction, un navigateur par PDF : entre deux invocations le processus est gele
  // et Chromium peut mourir sans que `isConnected` le sache. Sur un poste, on le garde.
  const b = SUR_LAMBDA ? await ouvrir() : await navigateurPartage();
  try {
    return await rendreAvec(b, html);
  } finally {
    if (SUR_LAMBDA) await b.close().catch(() => undefined);
  }
}

async function rendreAvec(b: Browser, html: string): Promise<Buffer> {
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      // Numero de page en pied, dans la marge basse de la regle @page.
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-family:Aptos,Calibri,Arial,sans-serif;font-size:8pt;color:#4C5347;text-align:right;padding:0 12mm 4mm 0"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    });
  } finally {
    await page.close();
  }
}
