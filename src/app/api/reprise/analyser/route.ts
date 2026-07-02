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
  modeExtraction,
} from "@/lib/reprise/adapters/router";
import { appliquerRecap, ajouterJournal, enregistrerJeu } from "@/lib/reprise/services/suivi-dossier";
import { analyserPatrimoine } from "@/lib/reprise/services/orchestrateur-patrimoine";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const docs: DocumentSource[] = await Promise.all(
    files.map(async (f) => ({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) })),
  );

  try {
    const { jeu, recap } = await analyserPatrimoine(getExtractionProvider(), docs);
    const repo = getRepriseDossierRepository();
    // Reporte compteurs + anomalies dans le dossier (le patrimoine devient des etats).
    await appliquerRecap(repo, dossierId, recap);
    // Persiste le jeu complet pour rehydrater la fiche a l'ouverture sans re-analyser.
    // Degrade proprement si la colonne jeu n'existe pas encore (ne casse pas l'analyse).
    await enregistrerJeu(repo, dossierId, jeu);
    await ajouterJournal(
      repo,
      dossierId,
      new Date().toISOString(),
      `Analyse des documents : ${recap.lots.total} lot(s), ${recap.cles.length} cle(s), ${recap.owners.total} coproprietaire(s).`,
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
