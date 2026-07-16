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
import {
  appliquerRecap,
  ajouterJournal,
  enregistrerJeu,
  enregistrerComptaResume,
  enregistrerComptaErreur,
} from "@/lib/reprise/services/suivi-dossier";
import { analyserDossierUnifie, estGrandLivre } from "@/lib/reprise/services/analyser-dossier";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plafond de taille TOTALE des uploads : les PDF sont lus entierement en RAM le temps
// de l'analyse, sans plafond un lot de gros scans pourrait faire tomber le process.
const TAILLE_TOTALE_MAX_OCTETS = 40 * 1024 * 1024; // 40 Mo

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

  // Verifie la somme des tailles AVANT toute lecture (f.size vient du multipart, gratuit).
  const totalOctets = files.reduce((somme, f) => somme + f.size, 0);
  if (totalOctets > TAILLE_TOTALE_MAX_OCTETS) {
    const totalMo = Math.ceil(totalOctets / (1024 * 1024));
    return NextResponse.json(
      {
        ok: false,
        message: `Documents trop volumineux : ${totalMo} Mo au total, plafond 40 Mo. Retire des fichiers ou analyse en plusieurs fois.`,
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

  try {
    const extractionCompta = avecGrandLivre ? getExtractionComptaProvider() : null;
    const { jeu, recap, compta } = await analyserDossierUnifie(getExtractionProvider(), extractionCompta, docs);
    const repo = getRepriseDossierRepository();
    // Reporte compteurs + anomalies dans le dossier (le patrimoine devient des etats).
    await appliquerRecap(repo, dossierId, recap);
    // Persiste le resume compta (dans les compteurs, JSONB) pour rehydrater le bloc compta.
    if (compta) await enregistrerComptaResume(repo, dossierId, compta);
    // Persiste (ou efface) l'erreur d'extraction du grand livre UNIQUEMENT si un grand livre
    // etait joint : degradation partielle (couche texte scannee) rehydratee a la reouverture ;
    // effacee des qu'une extraction reussit. Sans grand livre joint, on ne touche a rien.
    if (avecGrandLivre) await enregistrerComptaErreur(repo, dossierId, recap.comptaErreur);
    // Persiste le jeu complet (avec liaisons450 le cas echeant) pour rehydrater la fiche a
    // l'ouverture sans re-analyser. Degrade proprement si la colonne jeu n'existe pas encore.
    await enregistrerJeu(repo, dossierId, jeu);
    await ajouterJournal(
      repo,
      dossierId,
      new Date().toISOString(),
      `Analyse des documents : ${recap.lots.total} lot(s), ${recap.cles.length} cle(s), ${recap.owners.total} coproprietaire(s)` +
        (compta
          ? ` ; grand livre : ${compta.nbEcritures} ecriture(s), ${compta.nbComptes} compte(s), balance ${compta.equilibre ? "equilibree" : `ecart ${compta.ecart}`}` +
            (recap.liaison ? `, liaison 450 : ${recap.liaison.lies} lie(s) / ${recap.liaison.aTrancher} a trancher / ${recap.liaison.sansCompte} sans compte` : "")
          : recap.comptaErreur
            ? ` ; grand livre NON exploite : ${recap.comptaErreur}`
            : "") +
        ".",
    );
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
