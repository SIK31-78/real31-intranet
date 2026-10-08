// SMOKE manuel (REA-11) : l'adapter REEL saisit une facture REAL 31 sur SE999 (copro de
// test), verifie qu'un second envoi ne la recree pas, qu'elle est en « bon a payer » et
// modifiable, puis la SUPPRIME. Rien ne doit rester sur SE999.
//
// Lancement : corepack pnpm run test:smoke estale-compta-provider

import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  const txt = readFileSync("C:/Users/SekouKOMA/projects/real31-intranet/.env.local", "utf8");
  for (const l of txt.split("\n")) {
    const s = l.trim();
    if (!s || s.startsWith("#") || !s.includes("=")) continue;
    const i = s.indexOf("=");
    const k = s.slice(0, i);
    if (!process.env[k]) process.env[k] = s.slice(i + 1);
  }
});

const CONDO_SE999 = "f3f6eec5-112a-433f-801c-3cbdc1195bfa";

function pdfDeTest(texte: string): Uint8Array {
  const contenu = `BT /F1 14 Tf 60 760 Td (${texte}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</Font<</F1 5 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${contenu.length}>>\nstream\n${contenu}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let b = "%PDF-1.4\n";
  const off: number[] = [];
  objs.forEach((o, i) => {
    off.push(b.length);
    b += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xs = b.length;
  b +=
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    off.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xs}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(b, "latin1"));
}

describe("smoke saisie ESTALE (SE999 : cree, rejoue, relit, supprime)", () => {
  it(
    "saisit une facture REAL 31 en bon a payer, modifiable, sans doublon au second envoi",
    async () => {
      const { EstaleComptaProvider } = await import("./estale-compta-provider");
      const { estaleGql } = await import("./client");
      const provider = new EstaleComptaProvider();

      const numero = `TEST-REA11-${Date.now()}`;
      const facture = {
        coproCode: "SE999",
        numero,
        libelle: "TEST REA-11 honoraires de gestion courante (à supprimer)",
        date: "2026-10-01",
        echeance: "2026-10-31",
        lignes: [
          { compte: "6211", libelle: "Honoraires de gestion courante", montantTtc: 12, tva: 2 },
          { compte: "6213", libelle: "Forfait de frais postaux", montantTtc: 3.5, tva: 0 },
        ],
        pdf: pdfDeTest(`REAL 31 - FACTURE ${numero}`),
        nomFichier: `${numero}.pdf`,
      };

      expect(await provider.coproPresente("SE999")).toBe(true);

      const premier = await provider.deposerFacture(facture);
      console.log("1) premier envoi :", premier);
      expect(premier.dejaPresente).toBe(false);

      try {
        const second = await provider.deposerFacture(facture);
        console.log("2) second envoi :", second);
        expect(second).toEqual({ ecritureId: premier.ecritureId, dejaPresente: true });

        const { condo } = await estaleGql<{
          condo: { invoice: { item: Record<string, unknown> & { counterparts: unknown[] } } };
        }>(
          `query($c: ID!, $id: ID!) { condo(id: $c) { invoice { item(id: $id) {
            piece status amount vat isUpdatable isDeletable fileID
            counterparts { amount vat account { nomenclature } dkID }
          } } } }`,
          { c: CONDO_SE999, id: premier.ecritureId },
        );
        console.log("3) relue :", JSON.stringify(condo.invoice.item));
        expect(condo.invoice.item).toMatchObject({
          piece: numero,
          status: "PAYMENT",
          amount: 15.5,
          isUpdatable: true,
          isDeletable: true,
        });
        expect(condo.invoice.item.fileID).toBeTruthy();
        expect(condo.invoice.item.counterparts).toHaveLength(2);
      } finally {
        await estaleGql(`mutation($id: ID!) { updateEntry(id: $id) { delete { id } } }`, { id: premier.ecritureId });
        const apres = await estaleGql<{ condo: { invoice: { items: { id: string }[] } } }>(
          `query($c: ID!) { condo(id: $c) { invoice { items { id } } } }`,
          { c: CONDO_SE999 },
        );
        const reste = apres.condo.invoice.items.some((e) => e.id === premier.ecritureId);
        console.log("4) supprimée, encore présente :", reste);
        expect(reste).toBe(false);
      }
    },
    120_000,
  );

  it(
    "depose une facture A CODIFIER (facture a valider), puis la retire",
    async () => {
      const { EstaleComptaProvider } = await import("./estale-compta-provider");
      const { estaleGql } = await import("./client");
      const numero = `TEST-REA11-CODIF-${Date.now()}`;

      const { depotId } = await new EstaleComptaProvider().deposerFactureACodifier({
        coproCode: "SE999",
        pdf: pdfDeTest(`REAL 31 - FACTURE ${numero} - etat date`),
        nomFichier: `${numero}.pdf`,
      });
      console.log("5) déposée à codifier :", depotId);

      try {
        const { condo } = await estaleGql<{ condo: { invoice: { predictions: { id: string }[] } } }>(
          `query($c: ID!) { condo(id: $c) { invoice { predictions { id } } } }`,
          { c: CONDO_SE999 },
        );
        expect(condo.invoice.predictions.some((p) => p.id === depotId)).toBe(true);
      } finally {
        await estaleGql(`mutation($id: ID!) { deleteInvoicePrediction(id: $id) { __typename } }`, { id: depotId });
        console.log("6) retirée");
      }
    },
    120_000,
  );
});
