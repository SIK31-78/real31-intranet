"use server";

// Server Actions du flux "Nouvelle reprise" : analyse (extraction + recap GO/STOP) puis
// production des .xlsx eStale. Runtime nodejs (exceljs cote production). Contrat {ok,...},
// jamais de throw cote client. Cloisonnement : gestionnaire connecte exige.
//
// Le flux en deux temps est VOLONTAIRE (cf. orchestrateur) : analyserAction ne produit
// jamais les fichiers ; la production est une etape separee, declenchee sur GO humain, qui
// RE-VERIFIE les auto-checks cote serveur (garde-fou : on refuse si erreur bloquante).

import { z } from "zod";
import { getGestionnaireCourant } from "@/lib/auth/session";
import { getExtractionProvider } from "@/lib/reprise/adapters/router";
import {
  analyserPatrimoine,
  produirePhaseABuffers,
  type RecapPatrimoine,
} from "@/lib/reprise/services/orchestrateur-patrimoine";
import type { DocumentSource } from "@/lib/reprise/ports/extraction-provider";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

// Le jeu de donnees transite en JSON entre analyse et production. On le valide de facon
// souple (structure attendue) : les auto-checks deterministes font le vrai controle, la
// production RE-verifie de toute facon avant d'ecrire quoi que ce soit.
const zJeu = z.object({
  lots: z.array(z.unknown()).max(50_000),
  cles: z.array(z.unknown()).max(2_000),
  tantiemes: z.array(z.unknown()).max(500_000),
  owners: z.array(z.unknown()).max(50_000),
  attributions: z.array(z.unknown()).max(500_000),
});

export type AnalyseResultat =
  | { ok: true; recap: RecapPatrimoine; jeu: JeuDeDonnees; mode: "mock" }
  | { ok: false; message: string };

export type FichierProduit = { nom: string; base64: string };

export type ProduireResultat =
  | { ok: true; fichiers: FichierProduit[] }
  | { ok: false; message: string };

export async function analyserAction(formData: FormData): Promise<AnalyseResultat> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour lancer une analyse." };

  const files = formData.getAll("pdfs").filter((f): f is File => f instanceof File);
  if (files.length === 0) return { ok: false, message: "Aucun PDF fourni." };
  if (files.length > 50) return { ok: false, message: "Trop de fichiers (50 maximum)." };

  const docs: DocumentSource[] = await Promise.all(
    files.map(async (f) => ({ nom: f.name, contenu: new Uint8Array(await f.arrayBuffer()) })),
  );

  try {
    const { jeu, recap } = await analyserPatrimoine(getExtractionProvider(), docs);
    // mode "mock" tant que seul le provider mock est cable (mode demonstration).
    return { ok: true, recap, jeu, mode: "mock" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant l'analyse." };
  }
}

export async function produireAction(jeu: JeuDeDonnees): Promise<ProduireResultat> {
  const g = await getGestionnaireCourant();
  if (!g) return { ok: false, message: "Session expiree : reconnecte-toi pour produire les fichiers." };

  const valid = zJeu.safeParse(jeu);
  if (!valid.success) return { ok: false, message: "Jeu de donnees invalide ou absent." };

  try {
    // produirePhaseABuffers RE-verifie les auto-checks et refuse de produire si une
    // erreur bloquante subsiste (garde-fou serveur, jamais confiance au client).
    const fichiers = await produirePhaseABuffers(jeu);
    return {
      ok: true,
      fichiers: fichiers.map((f) => ({
        nom: f.nom,
        base64: Buffer.from(f.contenu).toString("base64"),
      })),
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erreur pendant la production." };
  }
}
