// Route handler de la revue du mapping comptable : recoit le grand livre (multipart PDF) +
// le code copro, lance l'extraction du grand livre (IA agnostique au format syndic) puis
// construit le PLAN de mapping et expose le referentiel eStale (comptes 401/450) pour l'ecran
// de revue. Renvoie aussi les decisions humaines deja persistees pour cette copro.
//
// Pourquoi une route API et PAS une Server Action : l'upload du grand livre (souvent scanne,
// plusieurs Mo) via Server Action bute sur la limite de body ET sur la serialisation des File
// (cf. api/reprise/analyser). Une route handler lit le multipart nativement. La persistance des
// decisions reste des Server Actions (JSON leger).
//
// DRY-RUN STRICT : aucune ecriture, aucune mutation eStale. Auth : meme garde que la reprise
// patrimoine (getGestionnaireCourant).
//
// PII : le plan et le referentiel portent des noms (affiches en UI, app interne authentifiee) ;
// on ne les LOGUE jamais.

import { NextResponse } from "next/server";
import { getGestionnaireCourant } from "@/lib/auth/session";
import {
  getExtractionComptaProvider,
  getMappingDecisionRepository,
  modeExtraction,
} from "@/lib/reprise/adapters/router";
import { extraireEtVerifierGrandLivre } from "@/lib/reprise/services/reprendre-compta";
import { preparerRevueMapping } from "@/lib/reprise/services/mapping-compta";
import { grouperEcrituresParCompte } from "@/lib/reprise/domain/ecriture";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Plafond de taille TOTALE des uploads (le PDF est lu entierement en RAM le temps de l'analyse).
const TAILLE_TOTALE_MAX_OCTETS = 40 * 1024 * 1024; // 40 Mo

export async function POST(req: Request) {
  const g = await getGestionnaireCourant();
  if (!g) return NextResponse.json({ ok: false, message: "Session expiree : reconnecte-toi." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const ct = req.headers.get("content-type") ?? "(absent)";
    const cl = req.headers.get("content-length") ?? "(absent)";
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[reprise/mapping-analyser] formData KO", { ct, cl, detail });
    return NextResponse.json(
      { ok: false, message: `Requete invalide. content-type=${ct} ; taille=${cl} octets ; erreur=${detail}` },
      { status: 400 },
    );
  }

  const coproCode = String(form.get("coproCode") ?? "").trim();
  if (!coproCode || coproCode.length > 40) {
    return NextResponse.json({ ok: false, message: "Code copro invalide." }, { status: 400 });
  }

  const files = form.getAll("pdfs").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ ok: false, message: "Aucun PDF fourni." }, { status: 400 });
  if (files.length > 50) return NextResponse.json({ ok: false, message: "Trop de fichiers (50 maximum)." }, { status: 400 });

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

  // Lecture SEQUENTIELLE (pas de Promise.all) : lisse le pic memoire.
  const docs: DocumentSource[] = [];
  for (const f of files) {
    docs.push({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) });
  }

  try {
    // 1. Extraction du grand livre + auto-check d'equilibre (offline, deterministe).
    const { jeu, equilibreGlobal } = await extraireEtVerifierGrandLivre(getExtractionComptaProvider(), docs);

    // 2. Construction du plan de mapping + referentiel eStale (comptes 401/450).
    const revue = await preparerRevueMapping(jeu, coproCode);
    if (!revue.ok) {
      return NextResponse.json({ ok: false, message: revue.message }, { status: 400 });
    }

    // 3. Decisions humaines deja tranchees pour cette copro (rehydratation de l'ecran).
    const decisions = await getMappingDecisionRepository().lister(coproCode);

    // 4. Grand livre GROUPE par compte source (colonnes debit/credit) : sert a l'ecran a deplier
    // les ecritures de chaque compte a trancher. Vient de l'analyse DEJA faite (pas de re-fetch) ;
    // groupe cote serveur pour ne pas envoyer les ~800 lignes a plat. PII : libelles affiches en
    // UI (app interne) mais jamais logues.
    const grandLivre = grouperEcrituresParCompte(jeu.lignes);

    return NextResponse.json({
      ok: true,
      plan: revue.plan,
      candidats: revue.candidats,
      decisions,
      grandLivre,
      equilibre: equilibreGlobal,
      mode: modeExtraction(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse du grand livre." },
      { status: 500 },
    );
  }
}
