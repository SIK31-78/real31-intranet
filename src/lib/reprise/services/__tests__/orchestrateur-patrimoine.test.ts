// Tests de l'orchestrateur patrimoine - entree par FICHIERS EXCEL (refonte 2026-08).
// Le chemin nominal passe par de VRAIS buffers xlsx (genererPhaseABuffers -> analyse) :
// c'est le dry-run du flux reel "le gestionnaire verse les fichiers du skill".

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { genererPhaseABuffers } from "@/lib/reprise/adapters/xlsx/generer-xlsx";
import type { DocumentSource } from "@/lib/reprise/ports/document-source";
import { jeuCanonique } from "./fixtures/jeu-canonique";
import { analyserPatrimoineDepuisXlsx, produirePhaseA } from "../orchestrateur-patrimoine";

const outDir = mkdtempSync(join(tmpdir(), "reprise-orch-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

/** Les 4 fichiers verses = les buffers generes depuis le jeu canonique (aller-retour reel). */
async function fichiersVerses(jeu = jeuCanonique()): Promise<DocumentSource[]> {
  const buffers = await genererPhaseABuffers(jeu);
  return buffers.map((b) => ({ nom: b.nom, contenu: b.contenu }));
}

describe("analyserPatrimoineDepuisXlsx", () => {
  it("parse les 4 xlsx verses et calcule le recap GO/STOP", async () => {
    const { jeu, recap, erreursParsing } = await analyserPatrimoineDepuisXlsx(await fichiersVerses());

    expect(erreursParsing).toEqual([]);
    expect(jeu.lots).toHaveLength(3);
    expect(recap.lots.parUsage.residential).toBe(2);
    expect(recap.lots.parUsage.parking).toBe(1);

    expect(recap.cles).toHaveLength(1);
    expect(recap.cles[0]!.ecart).toBe(0);

    expect(recap.owners.total).toBe(3);
    expect(recap.owners.sci).toBe(1);
    expect(recap.owners.couples).toBe(1);

    expect(recap.attributions.lotsOrphelins).toBe(0);
    expect(recap.pretAProduire).toBe(true);
    expect(recap.checks.ok).toBe(true);
  });

  it("verrouille pretAProduire=false sur une erreur STRUCTURELLE de parsing", async () => {
    const fichiers = await fichiersVerses();
    // On casse le fichier links : un nom qui n'existe pas dans owners.xlsx.
    const casse = fichiers.filter((f) => !f.nom.startsWith("links"));
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Répartitions");
    ws.addRow(["N° Copropriétaire", "N° Lot"]);
    ws.addRow(["INTROUVABLE Paul", 1]);
    const buf = await wb.xlsx.writeBuffer();
    casse.push({ nom: "links_DRAFT.xlsx", contenu: new Uint8Array(buf as ArrayBuffer) });

    const { recap, erreursParsing } = await analyserPatrimoineDepuisXlsx(casse);
    expect(erreursParsing.some((e) => e.includes("introuvable"))).toBe(true);
    expect(recap.pretAProduire).toBe(false);
    // L'erreur est VISIBLE dans les notes du recap (jamais un silence).
    expect(recap.notes.some((n) => n.includes("introuvable"))).toBe(true);
  });

  it("signale pretAProduire=false quand une erreur METIER subsiste (lot orphelin)", async () => {
    const jeu = jeuCanonique();
    jeu.attributions = jeu.attributions.slice(0, 2); // le lot 3 n'a plus de proprietaire
    const { recap } = await analyserPatrimoineDepuisXlsx(await fichiersVerses(jeu));
    expect(recap.pretAProduire).toBe(false);
    expect(recap.checks.erreurs.some((e) => e.code === "LINK_LOT_ORPHELIN")).toBe(true);
  });
});

describe("produirePhaseA", () => {
  it("genere les fichiers quand le jeu est valide (apres GO)", async () => {
    const { jeu } = await analyserPatrimoineDepuisXlsx(await fichiersVerses());
    const fichiers = await produirePhaseA(jeu, { outDir });
    expect(fichiers.map((f) => f.type)).toEqual(["lots", "tantiemes", "owners", "links_draft"]);
  });

  it("REFUSE de produire si une erreur bloquante subsiste", async () => {
    const { jeu } = await analyserPatrimoineDepuisXlsx(await fichiersVerses());
    jeu.tantiemes[0]!.valeur = 1; // casse le total de la cle 001
    await expect(produirePhaseA(jeu, { outDir })).rejects.toThrow(/Production refusee/);
  });
});
