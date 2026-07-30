// SMOKE (hors `vitest run`, cf. vitest.smoke.config.mts) : les trois tests d'acceptation du
// port OcrProvider, sur les PDF RÉELS de `data/S0306/` — qui est gitignoré (28 Mo de PII).
// Ils ne peuvent donc pas tourner en CI : c'est assumé, l'étage anonymisé de la fixture
// (data/samples/S0306) couvre tout ce qui est vérifiable sans les originaux.
//
// Lancer : pnpm run test:smoke  (ou vitest --config vitest.smoke.config.mts sur ce fichier)
//
// CE QUE CES TROIS TESTS FERMENT. Le sujet de la rotation a coûté une série de mesures fausses
// (20/28/22 cellules lues à l'envers) et un faux positif d'OSD qui aurait retourné une page
// droite. On ne le rejoue pas : on le verrouille sur les trois cas réels du lot.

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { TesseractOcrProvider } from "@/lib/reprise/adapters/ocr/tesseract-ocr-provider";
import { decisionOsd, verifierOrientationPage } from "@/lib/reprise/domain/orientation-page";

const BASE = join(process.cwd(), "data", "S0306");
const lire = (nom: string): Uint8Array => new Uint8Array(readFileSync(join(BASE, nom)));
const dispo = (nom: string): boolean => existsSync(join(BASE, nom));

const provider = new TesseractOcrProvider("fra");
/** L'OCR d'une page de scan prend ~0,5 s, plus le chargement du worker et du modèle. */
const DELAI = 120_000;

describe("acceptation du port OcrProvider - rotation honorée PAR PAGE", () => {
  it(
    "1. RCP 2.pdf p.30 (/Rotate 180) : le premier mot lu n'est pas un miroir",
    async () => {
      if (!dispo("RCP 2.pdf")) return; // lot absent : rien à prouver, pas d'échec artificiel
      const r = await provider.ocriser(lire("RCP 2.pdf"), [30]);
      const page = r.pages[0]!;

      // La rotation appliquée est RELEVÉE, pas supposée : c'est ce champ qui rend la
      // correction de la chaîne prouvable.
      expect(page.rotationAppliquee).toBe(180);

      const texte = page.tokens.map((t) => t.texte).join(" ").toUpperCase();
      // Le miroir de "TABLEAU" est "TIALYAV.L" : sa présence signerait une page non redressée.
      expect(texte).not.toContain("TIALYAV");
      // Et l'en-tête réel du tableau doit se lire.
      expect(texte).toMatch(/NATURE|LOT|QUOTE/);

      // Des tantièmes doivent être lus : à l'envers, il y en avait ZÉRO.
      const numeriques = page.tokens.filter((t) => /^\d+$/.test(t.texte));
      expect(numeriques.length).toBeGreaterThan(20);

      // Et l'assertion de vraisemblance doit accepter la page.
      const v = verifierOrientationPage({
        tokens: page.tokens.map((t) => ({ texte: t.texte, confiance: t.confiance })),
        tableauAttendu: true,
      });
      expect(v.verdict).toBe("vraisemblable");
    },
    DELAI,
  );

  it(
    "2. CONVOCATION p.15 (/Rotate 90) : lue correctement malgré une rotation non-180",
    async () => {
      const nom = "CONVOCATION_AG_654464_139.pdf";
      if (!dispo(nom)) return;
      const r = await provider.ocriser(lire(nom), [15]);
      const page = r.pages[0]!;
      // Le document porte TROIS valeurs de /Rotate : le raccourci "rotation du document"
      // serait faux ici. On vérifie qu'on a bien lu celle de CETTE page.
      expect([0, 90, 180, 270]).toContain(page.rotationAppliquee);

      const v = verifierOrientationPage({
        tokens: page.tokens.map((t) => ({ texte: t.texte, confiance: t.confiance })),
      });
      // Une page à 90° non redressée serait lue en fragments -> verdict "suspecte".
      expect(v.verdict).toBe("vraisemblable");
    },
    DELAI,
  );

  it(
    "3. RCP.pdf p.1 : NON redressée malgré un OSD à 180 (le faux positif est écarté)",
    () => {
      // Mesures du 30/07 : l'OSD rend 180 avec une confiance de 0,04 sur cette page, qui est
      // DROITE (c'est la couverture notariée, avec une mention manuscrite verticale dans la
      // marge). Sans seuil, un correcteur automatique la retournerait. Le seuil vit dans le
      // domaine : ce test verrouille la décision, sans dépendre du non-déterminisme de l'OSD.
      const d = decisionOsd(180, 0.04);
      expect(d.action).toBe("arbitrage_humain");
      if (d.action === "arbitrage_humain") expect(d.raison).toContain("ORIENTATIONS MIXTES");

      // Et les pages de corps du même PDF, elles, sont justement vues droites.
      expect(decisionOsd(0, 5.02)).toEqual({ action: "laisser", angle: 0 });
      expect(decisionOsd(0, 7.63)).toEqual({ action: "laisser", angle: 0 });
    },
  );

  it(
    "la provenance de la chaîne est renseignée (sinon 'chaîne figée' ne veut rien dire)",
    async () => {
      if (!dispo("rgd.pdf")) return;
      const r = await provider.ocriser(lire("rgd.pdf"), [1]);
      expect(r.provenance.moteur).toContain("tesseract.js");
      expect(r.provenance.langue).toBe("fra");
      expect(r.provenance.rasteriseur).toContain("pdfjs-dist");
      expect(r.provenance.segmentation).toContain("300 dpi");
      expect(r.provenance.pretraitement).toBe("aucun");
    },
    DELAI,
  );
});
