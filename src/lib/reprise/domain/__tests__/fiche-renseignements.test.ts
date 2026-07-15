// Tests du domaine PUR de la fiche de renseignements : transitions d'etat, expiration,
// generation du courrier HTML, modele de mail. Donnees SYNTHETIQUES (inventees).
import { describe, expect, it } from "vitest";
import {
  calculerExpiration,
  estExpiree,
  peutSoumettre,
  DUREE_VALIDITE_JOURS,
} from "@/lib/reprise/domain/fiche-renseignements";
import { genererCourriersDocument, genererCourrierPage, type ContexteCourrier } from "@/lib/reprise/domain/fiche-courrier";
import { objetMailEspaceClient, corpsMailEspaceClient } from "@/lib/reprise/domain/mail-espace-client";

const CTX: ContexteCourrier = {
  coproNom: "Residence des Lilas",
  coproRef: "S9999",
  coproAdresseLigne1: "3 rue Fictive",
  retourEmail: "gestionnaire@example.test",
  gestionnaireEmail: "gestionnaire@example.test",
};

describe("expiration / transitions", () => {
  it("calcule +90 jours par defaut", () => {
    const exp = calculerExpiration("2026-01-01T00:00:00.000Z");
    expect(exp.slice(0, 10)).toBe("2026-04-01");
    expect(DUREE_VALIDITE_JOURS).toBe(90);
  });

  it("estExpiree compare a la date courante", () => {
    const f = { expiresAt: "2026-04-01T00:00:00.000Z" };
    expect(estExpiree(f, "2026-03-31T23:00:00.000Z")).toBe(false);
    expect(estExpiree(f, "2026-04-02T00:00:00.000Z")).toBe(true);
  });

  it("peutSoumettre : seulement courrier_genere et non expiree", () => {
    const exp = "2026-04-01T00:00:00.000Z";
    const now = "2026-02-01T00:00:00.000Z";
    expect(peutSoumettre({ statut: "courrier_genere", expiresAt: exp }, now)).toBe(true);
    expect(peutSoumettre({ statut: "soumis", expiresAt: exp }, now)).toBe(false);
    expect(peutSoumettre({ statut: "valide", expiresAt: exp }, now)).toBe(false);
    expect(peutSoumettre({ statut: "courrier_genere", expiresAt: now }, "2026-05-01T00:00:00.000Z")).toBe(false);
  });
});

describe("courrier HTML", () => {
  const courrier = {
    ownerId: "o1",
    connues: {
      civilite: "M",
      nom: "DURAND",
      prenom: "Jean",
      pro: false,
      adrNum: "12",
      adrVoie: "avenue Test",
      adrCodePostal: "75000",
      adrVille: "PARIS",
      lots: [3, 7],
    },
    lien: "https://intra.example.test/fiche/AbC123",
    code: "4F7K2Q9C",
  };

  it("reproduit les sections du modele + injecte lien/code/adresse", () => {
    const html = genererCourrierPage(CTX, courrier);
    expect(html).toContain("FICHE DE RENSEIGNEMENTS COPROPRIETAIRE");
    expect(html).toContain("Votre copropriete");
    expect(html).toContain("Vos coordonnees");
    expect(html).toContain("Occupation de votre lot");
    expect(html).toContain("Consentements");
    expect(html).toContain("4F7K2Q9C");
    expect(html).toContain("https://intra.example.test/fiche/AbC123");
    expect(html).toContain("DURAND");
    expect(html).toContain("Residence des Lilas");
    expect(html).toContain("3, 7"); // lots
  });

  it("echappe le HTML des noms (anti-injection)", () => {
    const html = genererCourrierPage(CTX, {
      ...courrier,
      connues: { ...courrier.connues, nom: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("document complet = une page par courrier + bouton imprimer", () => {
    const doc = genererCourriersDocument(CTX, [courrier, { ...courrier, ownerId: "o2" }]);
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("window.print()");
    expect((doc.match(/class="page"/g) ?? []).length).toBe(2);
  });
});

describe("mail espace client", () => {
  it("objet porte la reference + corps sans signature", () => {
    const infos = { destinataire: "M DURAND", coproNom: "Residence des Lilas", coproRef: "S9999" };
    expect(objetMailEspaceClient(infos)).toContain("S9999");
    const corps = corpsMailEspaceClient(infos);
    expect(corps).toContain("Bonjour M DURAND,");
    expect(corps).toContain("Extranet Syndic ESTALE");
    expect(corps).not.toMatch(/signitic/i);
  });
});
