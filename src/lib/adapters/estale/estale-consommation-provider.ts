// Adapter ESTALE : factures de l'agence et leur detail de consommation (REA-490). Lecture
// seule, aucune mutation.
//
// Chemin releve le 03/11/2026 (le schema du depot est en retard sur l'API) :
//   me.agency.billing : BillingAgency { invoices(page: PaginationLimitInput!) : connexion }
// La pagination ESTALE commence a 0 : page 1 rend une liste vide sans erreur.
// urlXLS est une URL SIGNEE a duree limitee : on la relit a chaque detail, jamais en cache.

import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type { LigneConsommationEstale } from "@/lib/domain/facturation/frais-postaux-reels";
import type { ConsommationEstaleProvider, FactureEstaleRecue } from "@/lib/ports/consommation-estale-provider";
import { estaleGql } from "./client";
import { chargerCondosAccessibles, normaliserRef } from "./condos-accessibles";

const TAILLE_PAGE = 50;

type FactureRow = {
  reference: string;
  date: string;
  amountExclTax: number;
  amountInclTax: number;
  status: string;
  urlXLS: string;
};

async function facturesBrutes(): Promise<FactureRow[]> {
  const toutes: FactureRow[] = [];
  for (let page = 0; ; page++) {
    const data = await estaleGql<{ me: { agency: { billing: { invoices: { nodes: FactureRow[] } } } } }>(
      `query FacturesAgence($page: PaginationLimitInput!) {
        me { agency { billing { invoices(page: $page) {
          nodes { reference date amountExclTax amountInclTax status urlXLS }
        } } } }
      }`,
      { page: { page, limit: TAILLE_PAGE } },
    );
    const nodes = data.me.agency.billing.invoices.nodes;
    toutes.push(...nodes);
    if (nodes.length < TAILLE_PAGE) return toutes;
  }
}

/** "30/07/2026" -> "2026-07-30" ; une vraie date Excel est aussi acceptee. */
function dateISO(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v ?? "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function centimes(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function texte(v: unknown): string {
  if (v && typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(v ?? "").trim();
}

/**
 * Lit l'Excel « Consommation <mois> ». L'en-tete est repere par ses intitules (ligne
 * « Catégorie ») plutot que par sa position : une ligne de titre en plus ne casse rien.
 *
 * Lecture EN FLUX, pas `wb.xlsx.load` : l'Excel d'ESTALE porte dans docProps/core.xml une
 * balise <keywords> sans espace de noms, que le lecteur complet d'exceljs 4.4 refuse
 * (« Unexpected xml node in parseOpen »). Le lecteur en flux ne lit pas ces proprietes.
 */
export async function lireExcelConsommation(contenu: ArrayBuffer): Promise<LigneConsommationEstale[]> {
  const lecteur = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(Buffer.from(contenu)), {
    worksheets: "emit",
    sharedStrings: "cache",
    styles: "ignore",
    hyperlinks: "ignore",
  });

  let colonnes: Map<string, number> | null = null;
  const lignes: LigneConsommationEstale[] = [];
  for await (const feuille of lecteur) {
    for await (const row of feuille) {
      // row.values est un tableau A TROUS (indice 1 = colonne A) : Array.from les comble,
      // un .map les garderait.
      const brut = Array.from(row.values as unknown[]);
      const valeurs = brut.map(texte);
      if (!colonnes) {
        const normalise = valeurs.map((v) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());
        if (normalise.includes("categorie")) colonnes = new Map(normalise.map((v, i) => [v, i]));
        continue;
      }
      const index = colonnes;
      const col = (nom: string) => index.get(nom) ?? -1;
      const categorie = valeurs[col("categorie")] ?? "";
      if (!categorie) continue;
      lignes.push({
        scope: valeurs[col("scope")] ?? "",
        categorie,
        dateISO: dateISO(brut[col("date")]),
        prixUnitaireHtCentimes: centimes(brut[col("mt. unit. ht")]),
        prixUnitaireTtcCentimes: centimes(brut[col("mt. unit. ttc")]),
        quantite: Number(brut[col("quantite")] ?? 1) || 1,
        sourceId: valeurs[col("reference 1")] ?? "",
        detail: valeurs[col("detail")] ?? "",
      });
    }
    break; // une seule feuille utile
  }
  return lignes;
}

export class EstaleConsommationProvider implements ConsommationEstaleProvider {
  async listerFactures(): Promise<FactureEstaleRecue[]> {
    return (await facturesBrutes())
      .map((f) => ({
        reference: f.reference,
        dateISO: f.date.slice(0, 10),
        montantHt: f.amountExclTax,
        montantTtc: f.amountInclTax,
        statut: f.status,
      }))
      .sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  }

  async lireConsommation(reference: string): Promise<LigneConsommationEstale[]> {
    const facture = (await facturesBrutes()).find((f) => f.reference === reference);
    if (!facture) throw new Error(`Facture ESTALE ${reference} introuvable.`);
    const res = await fetch(facture.urlXLS, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Détail de la facture ESTALE ${reference} : HTTP ${res.status}.`);
    return lireExcelConsommation(await res.arrayBuffer());
  }

  async coprosDesMailings(): Promise<Map<string, string[]>> {
    const parMailing = new Map<string, Set<string>>();
    // Une copro apres l'autre, c'etait 15 a 20 s pour 15 copros (mesure du 03/11/2026) :
    // en parallele, une quinzaine de requetes, loin de la limite de 50/s d'ESTALE.
    const condos = await chargerCondosAccessibles();
    await Promise.all(condos.map(async (condo) => {
      for (let page = 0; ; page++) {
        const data = await estaleGql<{
          condo: { mailing: { items: { nodes: { id: string; condos: { reference: string }[] }[] } } };
        }>(
          `query MailingsCopro($id: ID!, $page: PaginationLimitInput!) {
            condo(id: $id) { mailing { items(page: $page) { nodes { id condos { reference } } } } }
          }`,
          { id: condo.id, page: { page, limit: TAILLE_PAGE } },
        );
        const nodes = data.condo.mailing.items.nodes;
        for (const m of nodes) {
          const codes = parMailing.get(m.id) ?? new Set<string>();
          for (const c of m.condos) codes.add(normaliserRef(c.reference));
          parMailing.set(m.id, codes);
        }
        if (nodes.length < TAILLE_PAGE) break;
      }
    }));
    return new Map([...parMailing.entries()].map(([id, codes]) => [id, [...codes]]));
  }
}
