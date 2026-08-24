// Route handler de la PRODUCTION du volet compta : recoit le(s) grand(s) livre(s) PDF
// (multipart) + le code copro + la date d'ouverture, rejoue l'extraction couche texte et le
// plan de mapping AVEC les decisions humaines persistees, puis produit :
//   - entries.xlsx (genere PUIS RELU - la batterie juge le fichier, R10) ;
//   - la batterie des 11 auto-checks comptables (un seul echec = pas de livraison) ;
//   - la fiche d'eclatements des classes 1/7 (saisie manuelle dans le module Eclatement) ;
//   - les CIBLES DE CALAGE par compte cible (verification post-import par lecture eStale).
//
// AUCUNE ecriture eStale : l'import du fichier reste un geste HUMAIN dans l'UI eStale.
// Meme pattern stateless que mapping-analyser : le GL est re-uploade (rien de lourd persiste).

import { NextResponse } from "next/server";
import { exigerAdminReprise } from "@/lib/auth/garde-reprise";
import { getExtractionComptaProvider, getMappingDecisionRepository } from "@/lib/reprise/adapters/router";
import { extraireEtVerifierGrandLivre } from "@/lib/reprise/services/reprendre-compta";
import { construirePlanMapping } from "@/lib/reprise/services/mapping-compta";
import { produireCompta } from "@/lib/reprise/services/produire-compta";
import { appliquerDecisions } from "@/lib/reprise/domain/decisions-mapping";
import { classerParExercice, raccorderExercices } from "@/lib/reprise/domain/controle-comptes";
import { verifierTailleLot } from "@/lib/reprise/domain/limites-upload";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import type { ResultatRepriseCompta } from "@/lib/reprise/services/reprendre-compta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const garde = await exigerAdminReprise("produire les fichiers compta");
  if (!garde.ok) return NextResponse.json({ ok: false, message: garde.message }, { status: garde.statut });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, message: `Requete invalide : ${detail}` }, { status: 400 });
  }

  const coproCode = String(form.get("coproCode") ?? "").trim();
  if (!coproCode || coproCode.length > 40) {
    return NextResponse.json({ ok: false, message: "Code copro invalide." }, { status: 400 });
  }
  // Date ISO du 1er jour de l'exercice produit (pose les reports a-nouveaux).
  const dateOuverture = String(form.get("dateOuverture") ?? "").trim();
  if (dateOuverture && !/^\d{4}-\d{2}-\d{2}$/.test(dateOuverture)) {
    return NextResponse.json({ ok: false, message: "Date d'ouverture invalide (AAAA-MM-JJ)." }, { status: 400 });
  }
  // Quel exercice produire quand DEUX grands livres sont verses : cloture (defaut) ou en cours.
  const exercice = String(form.get("exercice") ?? "cloture").trim();
  if (exercice !== "cloture" && exercice !== "en_cours") {
    return NextResponse.json({ ok: false, message: "Exercice invalide (cloture | en_cours)." }, { status: 400 });
  }

  const files = form.getAll("pdfs").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ ok: false, message: "Aucun grand livre fourni." }, { status: 400 });
  if (files.length > 4) return NextResponse.json({ ok: false, message: "Trop de fichiers (4 maximum)." }, { status: 400 });

  const totalOctets = files.reduce((somme, f) => somme + f.size, 0);
  const tropGros = verifierTailleLot(totalOctets, process.env.NODE_ENV === "production");
  if (tropGros) return NextResponse.json({ ok: false, message: tropGros }, { status: 400 });

  const docs: DocumentSource[] = [];
  for (const f of files) {
    docs.push({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) });
  }

  try {
    const provider = getExtractionComptaProvider();

    // 1. Extraction (couche texte, deterministe). Deux GL -> classement + controle croise.
    let cible: ResultatRepriseCompta;
    let raccordement;
    if (docs.length === 2) {
      const [a, b] = await Promise.all([
        extraireEtVerifierGrandLivre(provider, [docs[0]]),
        extraireEtVerifierGrandLivre(provider, [docs[1]]),
      ]);
      const classes = classerParExercice({ lignes: a.jeu.lignes, res: a }, { lignes: b.jeu.lignes, res: b });
      raccordement = raccorderExercices(
        { lignes: classes.cloture.res.jeu.lignes, controles: classes.cloture.res.jeu.controles },
        { lignes: classes.enCours.res.jeu.lignes, controles: classes.enCours.res.jeu.controles },
      );
      cible = exercice === "en_cours" ? classes.enCours.res : classes.cloture.res;
    } else {
      cible = await extraireEtVerifierGrandLivre(provider, docs);
    }

    // 2. Plan de mapping + decisions humaines persistees (rejouees cote domaine).
    const planBrut = await construirePlanMapping(cible.jeu, coproCode, undefined, undefined, raccordement);
    if (!planBrut.ok) return NextResponse.json({ ok: false, message: planBrut.message }, { status: 400 });
    const decisions = await getMappingDecisionRepository().lister(coproCode);
    const plan = appliquerDecisions(planBrut.plan, decisions);

    // 3. Production + batterie sur le fichier RELU.
    const r = await produireCompta(cible.jeu, plan, {
      ...(dateOuverture ? { dateOuverture } : {}),
      nonReconnues: [{ source: docs.map((d) => d.nom).join(" + "), nb: cible.jeu.nonReconnues ?? 0 }],
      ...(raccordement ? { raccordement } : {}),
    });

    return NextResponse.json({
      ok: r.ok,
      erreurs: r.erreurs,
      warnings: r.warnings,
      batterie: r.batterie,
      fiche: r.fiche,
      exclusions: r.exclusions,
      omission: { applicable: r.omission.applicable, nbPaires: r.omission.paires.length, notes: r.omission.notes },
      cibles: r.cibles,
      nbLignes: r.lignesRelues.length,
      // Le fichier n'est renvoye QUE si la batterie est verte (un seul echec = pas de livraison).
      ...(r.ok && r.entriesXlsx ? { entriesXlsxBase64: Buffer.from(r.entriesXlsx).toString("base64") } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la production." },
      { status: 500 },
    );
  }
}
