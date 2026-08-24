// Route handler de l'analyse d'un dossier de reprise : recoit les FICHIERS VERSES (multipart)
// et lance l'analyse unifiee DETERMINISTE (refonte 2026-08, plus aucune IA) :
//   - .xlsx patrimoine (lots / tantiemes_<code> / owners / links) -> parseur xlsx local ;
//   - grand livre PDF ("GL" / "grand livre" dans le nom) -> couche texte locale (pdfjs) ;
//   - le reste -> annexes (non analysees tant qu'aucun provider n'est branche : note).
//
// Pourquoi une route API et PAS une Server Action : l'upload de fichiers volumineux via
// Server Action bute sur la limite de body (1 MB) ET sur la serialisation des objets File
// (Turbopack/Next 16). Une route handler lit le multipart nativement, sans ces limites,
// et renvoie du JSON standard. La production/injection restent des Server Actions (JSON leger).

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import {
  getRepriseDossierRepository,
  getExtractionComptaProvider,
  getExtractionAnnexeProvider,
} from "@/lib/reprise/adapters/router";
import { appliquerResultatAnalyse } from "@/lib/reprise/services/suivi-dossier";
import { analyserDossierUnifie, estGrandLivre } from "@/lib/reprise/services/analyser-dossier";
import { verifierTailleLot } from "@/lib/reprise/domain/limites-upload";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sur Vercel, une fonction sans maxDuration est coupee au bout de ~10-15 s (defaut du plan).
// L'analyse est desormais entierement LOCALE (parsing xlsx + couche texte pdfjs, ~2 s sur un
// gros grand livre) mais un lot volumineux peut depasser le defaut -> 60 s de marge.
export const maxDuration = 60;

export async function POST(req: Request) {
  // ROLE : l'analyse est reservee aux ADMINS REPRISE (le SUIVI reste ouvert a tous). Garde
  // serveur : le grisage du bouton cote UI ne protege rien (cf. lib/auth/garde-reprise.ts).
  const garde = await exigerAdminReprise("lancer l'analyse");
  if (!garde.ok) return NextResponse.json({ ok: false, message: garde.message }, { status: garde.statut });

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
  if (files.length === 0) return NextResponse.json({ ok: false, message: "Aucun fichier fourni." }, { status: 400 });
  if (files.length > 50) return NextResponse.json({ ok: false, message: "Trop de fichiers (50 maximum)." }, { status: 400 });

  // Verifie les tailles AVANT toute lecture (f.size vient du multipart, gratuit).
  const totalOctets = files.reduce((somme, f) => somme + f.size, 0);
  const tropGros = verifierTailleLot(totalOctets, process.env.NODE_ENV === "production");
  if (tropGros) return NextResponse.json({ ok: false, message: tropGros }, { status: 400 });

  // Lecture SEQUENTIELLE (pas de Promise.all) : lisse le pic memoire quand plusieurs
  // gros fichiers arrivent dans la meme requete.
  const docs: DocumentSource[] = [];
  for (const f of files) {
    docs.push({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) });
  }

  // Le provider compta n'est construit QUE si un grand livre est present.
  const avecGrandLivre = docs.some((d) => estGrandLivre(d.nom));

  try {
    const extractionCompta = avecGrandLivre ? getExtractionComptaProvider() : null;
    // Provider ANNEXES : null aujourd'hui (analyse IA des annexes debranchee) - le service
    // note les annexes versees plutot que de les ignorer en silence.
    const extractionAnnexe = getExtractionAnnexeProvider();
    const { jeu, recap, compta, annexes } = await analyserDossierUnifie(extractionCompta, docs, extractionAnnexe);
    const repo = getRepriseDossierRepository();
    // Persistance GROUPEE : recap + resume compta + erreur GL + jeu + journal en UNE lecture /
    // UNE ecriture du dossier (le JSONB `jeu` de plusieurs Mo n'est pas rejoue en cycles).
    const journalTexte =
      `Fichiers verses : ${recap.lots.total} lot(s), ${recap.cles.length} cle(s), ${recap.owners.total} coproprietaire(s)` +
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
        (annexes
          ? ` ; ${annexes.annexes.length} document(s) annexe(s) : ${annexes.contacts.length} contact(s) rapproche(s)`
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
      annexes: annexes?.annexes,
      contactsAnnexes: annexes?.contacts,
      nowISO: new Date().toISOString(),
      journalTexte,
    });
    revalidatePath(`/reprise-copro/dossiers/${dossierId}`);
    revalidatePath("/reprise-copro/dossiers");
    return NextResponse.json({ ok: true, recap, jeu, annexes });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse." },
      { status: 500 },
    );
  }
}
