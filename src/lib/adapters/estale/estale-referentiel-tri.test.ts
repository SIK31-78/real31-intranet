import { describe, expect, it } from "vitest";
import { prestatairesDe } from "./estale-referentiel-tri";

// Contacts des prestataires ESTALE proposés comme destinataires (02/11/2026).
describe("prestatairesDe", () => {
  it("garde le contact et l'entreprise, une adresse une fois, sans nos adresses", () => {
    const r = prestatairesDe({
      suppliers: [
        { name: "DGP NETTOYAGE", contacts: [{ name: " Jean ", email: "Jean@DGP.fr" }, { name: "Doublon", email: "jean@dgp.fr" }] },
        { name: null, contacts: [{ name: null, email: "accueil@x.fr" }, { name: "Moi", email: "moi@real31.fr" }, { name: "Vide", email: null }] },
      ],
    });
    expect(r).toEqual([
      { nom: "Jean", entreprise: "DGP NETTOYAGE", email: "jean@dgp.fr" },
      { nom: "", entreprise: "", email: "accueil@x.fr" },
    ]);
  });
  it("aucun prestataire : liste vide", () => {
    expect(prestatairesDe({ suppliers: null })).toEqual([]);
  });
});
