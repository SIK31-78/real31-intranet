// Adapter Mistral (EU) du port ExtractionComptaProvider. Pipeline HYBRIDE :
//   (1) OCR du PDF (mistral-ocr-latest) -> markdown PAGE PAR PAGE (~1s pour 39 pages) ;
//   (2) l'IA ne recopie PLUS les ~1000 ecritures : on lui envoie 2-3 pages ECHANTILLON et elle
//       rend UNIQUEMENT une SPEC de format (SYSTEME_FORMAT_GRAND_LIVRE, 1 seul petit appel) ;
//   (3) parserGrandLivre applique cette spec de facon DETERMINISTE (zero reseau, testable) ->
//       transcription rapide et exacte des montants + capture des totaux par compte.
// FALLBACK : si la spec est invalide, si le parseur ne sort AUCUNE ecriture, ou si la balance
// globale est desequilibree AU-DELA d'un seuil genereux (parseur clairement casse), on reprend
// l'ancien pipeline full-LLM par LOTS (conserve tel quel ci-dessous). Le pipeline full-LLM
// etait lent (6 min) et avait rendu une balance a 122,61 EUR d'ecart : c'est un filet, pas la
// voie normale. Normalisation + auto-checks (balance) en aval. fetch + retry/backoff ; cle
// MISTRAL_API_KEY. Aucun SDK GraphQL ici.

import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { ExtractionComptaProvider } from "@/lib/reprise/ports/extraction-compta-provider";
import type { JeuEcritures } from "@/lib/reprise/domain/ecriture";
import { verifierEquilibreGrandLivre } from "@/lib/reprise/domain/ecriture";
import { verifierTotauxParCompte } from "@/lib/reprise/domain/controle-comptes";
import { normaliserGrandLivre } from "@/lib/reprise/adapters/shared/normaliser-compta";
import { SYSTEME_GRAND_LIVRE, extraireJson } from "@/lib/reprise/adapters/shared/prompts-compta";
import {
  SYSTEME_FORMAT_GRAND_LIVRE,
  validerSpecFormat,
  type SpecFormatGrandLivre,
} from "@/lib/reprise/adapters/shared/format-grand-livre";
import { parserGrandLivre } from "@/lib/reprise/adapters/shared/parseur-grand-livre";
import { extraireTextePages, estPdfNatif, type PageTexte } from "@/lib/reprise/adapters/shared/pdf-texte";
import { parserGrandLivrePositions } from "@/lib/reprise/adapters/shared/parseur-grand-livre-positions";

const BASE = "https://api.mistral.ai/v1";
const MODEL_OCR = process.env.MODEL_OCR || "mistral-ocr-latest";
// Extraction : mistral-small suffit pour STRUCTURER du texte deja OCR-ise, et mesure 3-4x plus
// vite que large sur les pages denses. La JUSTESSE est verifiee en aval par la balance.
const MODEL_EXTRACTION = process.env.MODEL_EXTRACTION_COMPTA || "mistral-small-latest";
// Modele qui rend la SPEC de format (petite sortie structurelle) : small suffit largement.
const MODEL_FORMAT = process.env.MODEL_FORMAT_COMPTA || "mistral-small-latest";
// Nombre de pages OCR par appel d'extraction (chunking du FALLBACK full-LLM).
const PAGES_PAR_LOT = Number(process.env.MISTRAL_PAGES_PAR_LOT) || 4;
// Timeout par appel (le defaut undici HeadersTimeout ~300s laisse trainer un lot bloque).
const TIMEOUT_APPEL_MS = Number(process.env.MISTRAL_TIMEOUT_MS) || 180_000;
// Concurrence des appels d'extraction du FALLBACK (1 = sequentiel, aucun 429 sur paliers bas).
const CONCURRENCE = Number(process.env.MISTRAL_CONCURRENCE) || 1;
// Seuil (EUR) au-dela duquel un desequilibre global signe que le parseur a RATE le format ->
// bascule sur le fallback full-LLM. Genereux volontairement : un petit ecart localise reste
// exploitable (les controles par compte le situent) et ne merite pas 6 min de full-LLM.
const SEUIL_FALLBACK_EUR = Number(process.env.MISTRAL_SEUIL_FALLBACK_EUR) || 1000;
// Nombre de pages echantillon envoyees a l'IA pour deduire la spec (debut + milieu, +1 option).
const PAGES_ECHANTILLON = Number(process.env.MISTRAL_PAGES_ECHANTILLON) || 3;

/** Map avec limite de concurrence (preserve l'ordre des resultats). */
async function pMap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, limite: number): Promise<R[]> {
  const resultats = new Array<R>(items.length);
  let prochain = 0;
  async function worker(): Promise<void> {
    while (prochain < items.length) {
      const i = prochain++;
      resultats[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, () => worker()));
  return resultats;
}

function cle(): string {
  const k = process.env.MISTRAL_API_KEY;
  if (!k) throw new Error("MISTRAL_API_KEY absente (.env.local)");
  return k;
}

async function appel(path: string, body: unknown): Promise<Response> {
  // 8 tentatives : le rate limit Mistral est par MINUTE -> il faut pouvoir attendre une fenetre
  // complete. Backoff = retry-after si fourni, sinon exponentiel plafonne a 60s.
  for (let tentative = 0; tentative < 8; tentative++) {
    let r: Response;
    try {
      r = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cle()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_APPEL_MS),
      });
    } catch (e) {
      if (tentative === 0) {
        await new Promise((res) => setTimeout(res, 1000));
        continue;
      }
      throw e;
    }
    if (r.status === 429 || r.status >= 500) {
      const retryAfter = Number(r.headers.get("retry-after"));
      const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(60_000, 4_000 * 2 ** tentative);
      await new Promise((res) => setTimeout(res, backoff));
      continue;
    }
    if (!r.ok) throw new Error(`Mistral ${path} ${r.status} : ${(await r.text()).slice(0, 200)}`);
    return r;
  }
  throw new Error(`Mistral ${path} : rate limit persistant apres retries`);
}

/** OCR d'un PDF -> markdown PAGE PAR PAGE (pour permettre le decoupage / l'echantillonnage). */
async function ocrPages(doc: DocumentSource): Promise<string[]> {
  const b64 = Buffer.from(doc.contenu).toString("base64");
  const r = await appel("/ocr", {
    model: MODEL_OCR,
    document: { type: "document_url", document_url: `data:${doc.mime || "application/pdf"};base64,${b64}` },
    include_image_base64: false,
  });
  const j = (await r.json()) as { pages?: { markdown?: string }[] };
  return (j.pages ?? []).map((p) => p.markdown ?? "");
}

/**
 * Choisit les pages ECHANTILLON pour deduire la spec : une du DEBUT (premier en-tete de compte)
 * et une (ou deux) du MILIEU (souvent plus denses, formats de ligne varies). Deduplique et borne
 * a PAGES_ECHANTILLON. Ne renvoie que des pages non vides.
 */
function choisirEchantillon(pages: string[]): string[] {
  const nonVides = pages.map((p, i) => ({ p, i })).filter((x) => x.p.trim().length > 0);
  if (nonVides.length === 0) return [];
  const n = nonVides.length;
  const cible = [0, Math.floor(n / 2), Math.min(n - 1, Math.floor(n / 2) + 1)];
  const vus = new Set<number>();
  const choix: string[] = [];
  for (const idx of cible) {
    if (choix.length >= PAGES_ECHANTILLON) break;
    if (vus.has(idx)) continue;
    vus.add(idx);
    choix.push(nonVides[idx]!.p);
  }
  return choix;
}

/** Demande a l'IA la SPEC de format a partir des pages echantillon (1 appel, sortie petite). */
async function demanderSpec(echantillon: string[]): Promise<SpecFormatGrandLivre> {
  const r = await appel("/chat/completions", {
    model: MODEL_FORMAT,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEME_FORMAT_GRAND_LIVRE },
      {
        role: "user",
        content:
          "Voici des PAGES ECHANTILLON (markdown OCR) d'un grand livre. Rends la SPEC de format en JSON, " +
          "sans recopier aucune ecriture.\n\n" +
          echantillon.map((p, i) => `=== PAGE ECHANTILLON ${i + 1} ===\n${p}`).join("\n\n"),
      },
    ],
  });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return validerSpecFormat(JSON.parse(extraireJson(j.choices?.[0]?.message?.content ?? "{}")));
}

/** Extraction JSON d'un LOT de pages (markdown concatene) -> brut du modele (FALLBACK). */
async function extraireLot(markdownLot: string): Promise<unknown> {
  const r = await appel("/chat/completions", {
    model: MODEL_EXTRACTION,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEME_GRAND_LIVRE },
      {
        role: "user",
        content:
          "Voici un EXTRAIT (quelques pages) d'un grand livre. Extrais les ecritures de CET extrait " +
          "en suivant les regles. Ne reprends pas les reports/soldes/totaux.\n\n" +
          markdownLot,
      },
    ],
  });
  const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return JSON.parse(extraireJson(j.choices?.[0]?.message?.content ?? "{}"));
}

/** Regroupe des pages en lots de PAGES_PAR_LOT. */
function enLots<T>(pages: T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < pages.length; i += taille) lots.push(pages.slice(i, i + taille));
  return lots;
}

/** FALLBACK : ancien pipeline full-LLM par lots (conserve tel quel). Reutilise les pages OCR. */
async function extraireParLots(pages: string[]): Promise<JeuEcritures> {
  const lots = enLots(pages, PAGES_PAR_LOT);
  const partiels = await pMap(lots, (lot) => extraireLot(lot.join("\n\n")).then(normaliserGrandLivre), CONCURRENCE);
  const jeu: JeuEcritures = { lignes: [], notes: [] };
  for (const p of partiels) {
    jeu.lignes.push(...p.lignes);
    for (const n of p.notes) if (!jeu.notes.includes(n)) jeu.notes.push(n);
  }
  jeu.notes.push(`Fallback full-LLM : ${lots.length} lot(s) de ${PAGES_PAR_LOT} pages (${pages.length} pages OCR).`);
  return jeu;
}

/**
 * Voie COUCHE TEXTE (PDF natif) : lit le texte positionne, verifie que c'est bien un PDF natif
 * (couche texte fournie), puis parse par positions de facon DETERMINISTE (aucun reseau, aucun
 * appel IA). Renvoie null si un doc n'est PAS natif (scan) ou si l'extraction n'est pas
 * exploitable (0 ecriture, gros desequilibre) -> l'appelant garde le pipeline OCR intact.
 */
async function extraireParCoucheTexte(docs: DocumentSource[]): Promise<JeuEcritures | null> {
  const pages: PageTexte[] = [];
  for (const d of docs) {
    const p = await extraireTextePages(d.contenu);
    if (!estPdfNatif(p)) return null; // au moins un doc scanne -> voie OCR
    pages.push(...p);
  }
  if (pages.length === 0) return null;

  const parse = parserGrandLivrePositions(pages);
  if (parse.lignes.length === 0) return null;

  const jeu = normaliserGrandLivre({ lignes: parse.lignes, notes: parse.notes });
  jeu.controles = parse.controles;
  // Intitules d'en-tete de compte (noms) captures par le parseur positionne -> exposes pour
  // l'appariement par nom du mapping (reprise). PII : jamais logue, reste dans la structure.
  if (parse.intitules) jeu.intitules = parse.intitules;

  const equ = verifierEquilibreGrandLivre(jeu.lignes);
  // Desequilibre ENORME = mapping de colonnes rate -> on prefere retomber sur l'OCR/IA.
  if (!equ.equilibre && Math.abs(equ.ecart) > SEUIL_FALLBACK_EUR) return null;

  const controle = verifierTotauxParCompte(jeu.lignes, parse.controles);
  jeu.notes.push(
    `Controle par compte : ${controle.nbComptesControles} controle(s), ${controle.nbEnEcart} en ecart.`,
  );
  jeu.notes.push(
    `Pipeline COUCHE TEXTE (PDF natif, positions) : ${jeu.lignes.length} ecriture(s), equilibre global ecart ${equ.ecart}.`,
  );
  return jeu;
}

export class MistralComptaExtractionProvider implements ExtractionComptaProvider {
  async extraireGrandLivre(docs: DocumentSource[]): Promise<JeuEcritures> {
    // VOIE PREFEREE : couche texte des PDF natifs (gratuite, instantanee, exacte -> chaque chiffre
    // est deja dans le fichier). On ne re-OCRise que les scans. Toute erreur ici (pdfjs KO, doc
    // corrompu) bascule sur l'OCR mais doit rester VISIBLE : un fallback silencieux fait
    // reapparaitre l'ecart OCR (-25,57 constate) et prive le mapping des intitules sans explication.
    let noteFallback: string | null = null;
    try {
      const jeuTexte = await extraireParCoucheTexte(docs);
      if (jeuTexte) return jeuTexte;
      noteFallback = "Couche texte non utilisee (PDF detecte comme scanne ou parsing incomplet) -> pipeline OCR.";
    } catch (e) {
      noteFallback = `Couche texte INDISPONIBLE (${e instanceof Error ? e.message.slice(0, 160) : "erreur inconnue"}) -> pipeline OCR. Precision degradee possible (ecart OCR, intitules absents).`;
      console.error("[reprise-compta] voie couche texte KO, fallback OCR :", e);
    }

    // OCR (une fois par doc) -> toutes les pages.
    const pages: string[] = [];
    for (const d of docs) pages.push(...(await ocrPages(d)));

    // Pipeline HYBRIDE : spec IA -> parseur deterministe. On bascule sur le fallback full-LLM
    // uniquement si le resultat n'est pas exploitable (spec KO, 0 ligne, gros desequilibre).
    try {
      const echantillon = choisirEchantillon(pages);
      if (echantillon.length === 0) throw new Error("aucune page OCR exploitable");

      const spec = await demanderSpec(echantillon);
      const parse = parserGrandLivre(pages, spec);
      const jeu = normaliserGrandLivre({ lignes: parse.lignes, notes: parse.notes });
      if (noteFallback) jeu.notes.unshift(noteFallback);
      jeu.controles = parse.controles;

      const equ = verifierEquilibreGrandLivre(jeu.lignes);
      const controle = verifierTotauxParCompte(jeu.lignes, parse.controles);
      jeu.notes.push(
        `Controle par compte : ${controle.nbComptesControles} controle(s), ${controle.nbEnEcart} en ecart.`,
      );

      const echecParseur =
        jeu.lignes.length === 0 || (!equ.equilibre && Math.abs(equ.ecart) > SEUIL_FALLBACK_EUR);
      if (!echecParseur) {
        jeu.notes.push(
          `Pipeline hybride (spec IA + parseur) : ${jeu.lignes.length} ecriture(s), equilibre global ecart ${equ.ecart}.`,
        );
        return jeu;
      }
      // Parseur clairement casse -> fallback, en gardant la trace de la raison.
      const raison =
        jeu.lignes.length === 0
          ? "0 ecriture parsee"
          : `desequilibre global ${equ.ecart} > seuil ${SEUIL_FALLBACK_EUR}`;
      const jeuFallback = await extraireParLots(pages);
      jeuFallback.notes.unshift(`Pipeline hybride ABANDONNE (${raison}) -> fallback full-LLM.`);
      if (noteFallback) jeuFallback.notes.unshift(noteFallback);
      return jeuFallback;
    } catch (e) {
      // Spec invalide / erreur reseau sur la spec : on retombe sur le pipeline full-LLM.
      const jeuFallback = await extraireParLots(pages);
      jeuFallback.notes.unshift(`Pipeline hybride indisponible (${(e as Error).message.slice(0, 120)}) -> fallback full-LLM.`);
      if (noteFallback) jeuFallback.notes.unshift(noteFallback);
      return jeuFallback;
    }
  }
}
