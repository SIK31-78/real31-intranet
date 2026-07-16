// Route handler de l'analyse reprise : recoit les PDF (multipart) et lance l'extraction.
//
// Pourquoi une route API et PAS une Server Action : l'upload de fichiers volumineux (RCP
// scanne...) via Server Action bute sur la limite de body (1 MB) ET sur la serialisation
// des objets File (Turbopack/Next 16). Une route handler lit le multipart nativement, sans
// ces limites, et renvoie du JSON standard. La production/injection restent des Server
// Actions (elles ne transportent que du JSON leger).

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getGestionnaireCourant } from "@/lib/auth/session";
import {
  getRepriseDossierRepository,
  getExtractionProvider,
  getExtractionComptaProvider,
  modeExtraction,
} from "@/lib/reprise/adapters/router";
import { appliquerResultatAnalyse } from "@/lib/reprise/services/suivi-dossier";
import { analyserDossierUnifie, estGrandLivre } from "@/lib/reprise/services/analyser-dossier";
import {
  TAILLE_TOTALE_MAX_OCTETS,
  TAILLE_TOTALE_MAX_LABEL,
  TAILLE_IA_MAX_OCTETS,
  TAILLE_IA_MAX_LABEL,
  PAGES_IA_MAX,
  enMo,
} from "@/lib/reprise/domain/limites-upload";
import { nombrePagesPdf } from "@/lib/reprise/adapters/shared/pdf-texte";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sur Vercel, une fonction sans maxDuration est coupee au bout de ~10-15 s (defaut du plan) :
// une extraction (2 appels IA sur des PDF volumineux, voire OCR) depasse largement ca -> 504
// en plein vol alors que le travail continue de bruler du credit. 300 s = plafond Fluid
// compute ; si le deploiement echoue sur un plan plus bas, redescendre a 60. En local : sans effet.
export const maxDuration = 300;

// Plafonds d'upload (audit API 2026-07-16, P1-8) - le RAISONNEMENT complet est documente dans
// lib/reprise/domain/limites-upload.ts :
//   - TAILLE_TOTALE (40 Mo) : plafond RAM, tout le lot est lu en memoire ;
//   - TAILLE_IA (20 Mo) sur les documents HORS grand livre : l'API Anthropic accepte 32 Mo par
//     requete et le base64 gonfle de x1,37 -> ~23 Mo de PDF utiles ; on garde une marge. Le
//     grand livre n'y est pas soumis (pipeline couche texte local, zero appel IA) ;
//   - PAGES_IA (100) quand le moteur est Claude : claude-haiku-4-5 (mission proprietaires,
//     contexte 200K) plafonne a 100 pages de PDF par requete.
// Objectif : un message actionnable AVANT l'analyse, pas un 413 API apres l'upload et l'attente.

export async function POST(req: Request) {
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.json({ ok: false, message: "Session expiree : reconnecte-toi." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    // Diagnostic : on remonte le content-type, la taille et l'erreur reelle (le message
    // generique masquait la cause - souvent un body trop volumineux ou un content-type absent).
    const ct = req.headers.get("content-type") ?? "(absent)";
    const cl = req.headers.get("content-length") ?? "(absent)";
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[reprise/analyser] formData KO", { ct, cl, detail });
    return NextResponse.json(
      { ok: false, message: `Requete invalide. content-type=${ct} ; taille=${cl} octets ; erreur=${detail}` },
      { status: 400 },
    );
  }

  const dossierId = String(form.get("dossierId") ?? "").trim();
  if (!dossierId || dossierId.length > 40) {
    return NextResponse.json({ ok: false, message: "Dossier invalide." }, { status: 400 });
  }

  const files = form.getAll("pdfs").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ ok: false, message: "Aucun PDF fourni." }, { status: 400 });
  if (files.length > 50) return NextResponse.json({ ok: false, message: "Trop de fichiers (50 maximum)." }, { status: 400 });

  // Verifie les tailles AVANT toute lecture (f.size vient du multipart, gratuit).
  const totalOctets = files.reduce((somme, f) => somme + f.size, 0);
  if (totalOctets > TAILLE_TOTALE_MAX_OCTETS) {
    return NextResponse.json(
      {
        ok: false,
        message: `Documents trop volumineux : ${enMo(totalOctets)} Mo au total, plafond ${TAILLE_TOTALE_MAX_LABEL}. Retire des fichiers ou analyse en plusieurs fois.`,
      },
      { status: 400 },
    );
  }
  // Plafond IA : seuls les documents HORS grand livre partent en base64 chez Claude/Mistral
  // (le grand livre est lu localement en couche texte). Cf. commentaire de tete + limites-upload.ts.
  const iaOctets = files.filter((f) => !estGrandLivre(f.name)).reduce((somme, f) => somme + f.size, 0);
  if (iaOctets > TAILLE_IA_MAX_OCTETS) {
    return NextResponse.json(
      {
        ok: false,
        message:
          `Documents patrimoine trop volumineux pour l'analyse IA : ${enMo(iaOctets)} Mo (hors grand livre), plafond ${TAILLE_IA_MAX_LABEL} ` +
          `(limite de l'API d'extraction : 32 Mo par requête, encodage base64 inclus). Scinde les PDF ou analyse en plusieurs fois.`,
      },
      { status: 400 },
    );
  }

  // Lecture SEQUENTIELLE (pas de Promise.all) : lisse le pic memoire quand plusieurs
  // gros PDF arrivent dans la meme requete.
  const docs: DocumentSource[] = [];
  for (const f of files) {
    docs.push({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) });
  }

  // Analyse UNIFIEE : patrimoine + (si un grand livre est joint) compta + liaison owners<->450.
  // Le provider compta n'est construit QUE si un grand livre est present (evite le throw du
  // routeur en prod-mock quand aucune compta n'est demandee).
  const avecGrandLivre = docs.some((d) => estGrandLivre(d.nom));

  // Plafond PAGES quand le moteur est Claude : la mission proprietaires tourne sur
  // claude-haiku-4-5 (contexte 200K) que l'API borne a 100 pages de PDF par requete - un lot
  // de 150 pages echouerait cote API apres l'upload. Comptage local (pdfjs, xref seulement,
  // quasi gratuit) sur les documents envoyes a l'IA. Un PDF illisible est ignore ici :
  // l'extraction remontera sa propre erreur, plus parlante.
  if (modeExtraction() === "claude") {
    let pagesIa = 0;
    for (const d of docs) {
      if (estGrandLivre(d.nom)) continue;
      try {
        pagesIa += await nombrePagesPdf(d.contenu);
      } catch {
        // PDF corrompu/illisible : on laisse l'extraction produire son erreur explicite.
      }
    }
    if (pagesIa > PAGES_IA_MAX) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `Documents patrimoine trop longs pour l'analyse IA : ${pagesIa} pages au total (hors grand livre), ` +
            `plafond ${PAGES_IA_MAX} pages par analyse (limite de l'API d'extraction). Scinde les PDF (garde les pages utiles : état descriptif, liste des copropriétaires...) ou analyse en plusieurs fois.`,
        },
        { status: 400 },
      );
    }
  }

  try {
    const extractionCompta = avecGrandLivre ? getExtractionComptaProvider() : null;
    const { jeu, recap, compta } = await analyserDossierUnifie(getExtractionProvider(), extractionCompta, docs);
    const repo = getRepriseDossierRepository();
    // Persistance GROUPEE (audit API 2026-07-16, P1-7) : recap + resume compta + erreur GL +
    // jeu + journal en UNE lecture / UNE ecriture du dossier, au lieu de 5 cycles obtenir()/
    // sauver() de la ligne complete (JSONB `jeu` de plusieurs Mo rejoue a chaque cycle).
    // Meme semantique que l'ancienne sequence (cf. appliquerResultatAnalyse).
    const journalTexte =
      `Analyse des documents : ${recap.lots.total} lot(s), ${recap.cles.length} cle(s), ${recap.owners.total} coproprietaire(s)` +
        (compta
          ? ` ; grand livre cloture : ${compta.nbEcritures} ecriture(s), ${compta.nbComptes} compte(s), balance ${compta.equilibre ? "equilibree" : `ecart ${compta.ecart}`}` +
            (recap.comptaEnCours
              ? ` ; grand livre en cours : ${recap.comptaEnCours.nbEcritures} ecriture(s), ${recap.comptaEnCours.nbComptes} compte(s), balance ${recap.comptaEnCours.equilibre ? "equilibree" : `ecart ${recap.comptaEnCours.ecart}`}`
              : "") +
            (recap.raccordement
              ? ` ; controle croise : ${recap.raccordement.raccorde ? "exercices raccordes au centime" : `${recap.raccordement.ecarts.length} ecart(s) + ${recap.raccordement.comptesSansVisAVis.length} compte(s) sans vis-a-vis`}`
              : "") +
            (recap.liaison ? `, liaison 450 : ${recap.liaison.lies} lie(s) / ${recap.liaison.aTrancher} a trancher / ${recap.liaison.sansCompte} sans compte` : "")
          : recap.comptaErreur
            ? ` ; grand livre NON exploite : ${recap.comptaErreur}`
            : "") +
        ".";
    await appliquerResultatAnalyse(repo, dossierId, {
      recap,
      jeu,
      compta,
      comptaEnCours: recap.comptaEnCours,
      raccordement: recap.raccordement,
      grandLivreJoint: avecGrandLivre,
      comptaErreur: recap.comptaErreur,
      nowISO: new Date().toISOString(),
      journalTexte,
    });
    revalidatePath(`/reprise-copro/dossiers/${dossierId}`);
    revalidatePath("/reprise-copro/dossiers");
    return NextResponse.json({ ok: true, recap, jeu, mode: modeExtraction() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse." },
      { status: 500 },
    );
  }
}
