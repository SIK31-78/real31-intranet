// Route handler de la revue du mapping comptable : recoit le grand livre (multipart PDF) +
// le code copro, lance l'extraction du grand livre (couche texte DETERMINISTE, zero IA) puis
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
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import {
  getExtractionComptaProvider,
  getMappingDecisionRepository,
} from "@/lib/reprise/adapters/router";
import { extraireEtVerifierGrandLivre } from "@/lib/reprise/services/reprendre-compta";
import { preparerRevueMapping } from "@/lib/reprise/services/mapping-compta";
import { grouperEcrituresPourRevue } from "@/lib/reprise/domain/ecriture";
import { balanceParCompte } from "@/lib/reprise/domain/controle-comptes";
import { verifierTailleLot } from "@/lib/reprise/domain/limites-upload";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sur Vercel, une fonction sans maxDuration est coupee au bout de ~10-15 s (defaut du plan) :
// la lecture couche texte d'un gros grand livre + le plan de mapping + les lectures eStale
// peuvent depasser ca -> 504 en plein vol. 300 s = plafond Fluid compute ; si le deploiement
// echoue sur un plan plus bas, redescendre a 60. En local : sans effet.
export const maxDuration = 300;

// Plafond de taille TOTALE des uploads (le PDF est lu entierement en RAM le temps de l'analyse) :
// 40 Mo en local, ~4 Mo en PRODUCTION (mur Vercel : body serverless coupe a ~4,5 Mo, cf.
// limites-upload.ts). Cette route n'a PAS de plafond IA (audit API 2026-07-16,
// P1-8) : le grand livre est extrait par la COUCHE TEXTE locale (pdfjs, zero appel IA), les
// limites de l'API Anthropic/Mistral ne s'appliquent donc pas ici - contrairement a
// /api/reprise/analyser qui borne a 20 Mo / 100 pages ce qui part chez Claude.

export async function POST(req: Request) {
  // ROLE : la revue du mapping est reservee aux ADMINS REPRISE. Garde serveur (le grisage de
  // l'ecran cote UI ne protege rien) - cf. lib/auth/garde-reprise.ts.
  const garde = await exigerAdminReprise("analyser le grand livre");
  if (!garde.ok) return NextResponse.json({ ok: false, message: garde.message }, { status: garde.statut });

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
  const tropGros = verifierTailleLot(totalOctets, process.env.NODE_ENV === "production");
  if (tropGros) return NextResponse.json({ ok: false, message: tropGros }, { status: 400 });

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
    // groupe cote serveur pour ne pas envoyer les ~800 lignes a plat. Regle Sekou : le detail
    // ligne a ligne ne sert qu'au bloc A (classes 4/5) ; pour la classe 6 et les classes 1/2/3/7
    // on controle les SOLDES par compte -> lignes videes cote serveur (payload allege). PII :
    // libelles affiches en UI (app interne) mais jamais logues.
    const grandLivre = grouperEcrituresPourRevue(jeu.lignes);

    // 5. Balance par compte = l'artefact de verification de la COMPTABLE (regle REAL31 :
    // elle valide la balance de chaque compte, pas les ecritures une a une). Deja calculee
    // implicitement par les controles ; on l'expose en table complete triee.
    const balance = balanceParCompte(jeu.lignes, jeu.controles ?? [], jeu.intitules);

    return NextResponse.json({
      ok: true,
      plan: revue.plan,
      candidats: revue.candidats,
      decisions,
      grandLivre,
      balance,
      equilibre: equilibreGlobal,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse du grand livre." },
      { status: 500 },
    );
  }
}
