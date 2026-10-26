import { describe, expect, it } from "vitest";
import { activitesDirigees } from "@/lib/domain/collaborateur";
import { activiteDuTrousseau, agenceAffichee, agencesVisibles, estDirectionCles, peutOperer, type Acteur } from "./acteur";
import type { Acces } from "./types";

const copro = (ordre = 0): Pick<Acces, "bien" | "ordre"> => ({ bien: { type: "copro", code: "S0042" }, ordre });
const lot = (ordre = 0): Pick<Acces, "bien" | "ordre"> => ({ bien: { type: "lot_locatif", id: "b1", ref: "BASSEVILLE-20" }, ordre });
const vente = (ordre = 0): Pick<Acces, "bien" | "ordre"> => ({ bien: { type: "bien_vente", id: "b2", ref: "PICQUOT-35" }, ordre });

const GESTIONNAIRE_LGC: Acteur = { id: "u1", nom: "Neis L.", agence: "LGC", direction: [] };
const NADINE: Acteur = { id: "u2", nom: "Nadine L.", agence: "LGC", direction: [], activitesDirigees: ["transaction", "location"] };
const XAVIER: Acteur = { id: "u3", nom: "Xavier B.", agence: "LGC", direction: [], activitesDirigees: ["transaction"] };
const CHRYSTELLE: Acteur = { id: "u4", nom: "Chrystelle B.", agence: "LGC", direction: [], agencesDeleguees: ["ASN"] };
const REFERENT_ASN: Acteur = { id: "u5", nom: "Réf. ASN", agence: "ML", direction: ["ASN"] };

describe("activiteDuTrousseau", () => {
  it("copro -> syndic, lot locatif -> location, bien en vente -> transaction", () => {
    expect(activiteDuTrousseau({ acces: [copro()] })).toBe("syndic");
    expect(activiteDuTrousseau({ acces: [lot()] })).toBe("location");
    expect(activiteDuTrousseau({ acces: [vente()] })).toBe("transaction");
  });

  it("suit l'acces principal (ordre 0), quel que soit l'ordre du tableau", () => {
    expect(activiteDuTrousseau({ acces: [copro(1), lot(0)] })).toBe("location");
  });

  it("sans acces : syndic", () => {
    expect(activiteDuTrousseau({ acces: [] })).toBe("syndic");
  });
});

describe("peutOperer : agence x activite (REA-90)", () => {
  it("l'equipe de l'agence opere sur toutes ses activites, pas ailleurs", () => {
    expect(peutOperer(GESTIONNAIRE_LGC, "LGC", "syndic")).toBe(true);
    expect(peutOperer(GESTIONNAIRE_LGC, "lgc", "location")).toBe(true);
    expect(peutOperer(GESTIONNAIRE_LGC, "ASN", "location")).toBe(false);
  });

  it("qui dirige une activite opere sur cette activite dans toutes les agences", () => {
    expect(peutOperer(NADINE, "ASN", "location")).toBe(true);
    expect(peutOperer(NADINE, "HLS", "transaction")).toBe(true);
    expect(peutOperer(XAVIER, "ASN", "transaction")).toBe(true);
  });

  it("diriger une activite n'ouvre pas les autres", () => {
    expect(peutOperer(NADINE, "ASN", "syndic")).toBe(false);
    expect(peutOperer(XAVIER, "ASN", "location")).toBe(false);
  });

  it("sans activite donnee, seule l'agence compte", () => {
    expect(peutOperer(NADINE, "ASN")).toBe(false);
  });

  it("une delegation d'agence active ouvre toute l'agence", () => {
    expect(peutOperer(CHRYSTELLE, "ASN", "syndic")).toBe(true);
    expect(peutOperer(CHRYSTELLE, "ASN", "location")).toBe(true);
    expect(peutOperer(CHRYSTELLE, "ML", "syndic")).toBe(false);
  });

  it("la direction de l'agence et la direction pleine, comme avant", () => {
    expect(peutOperer(REFERENT_ASN, "ASN", "location")).toBe(true);
    expect(peutOperer({ id: "d", nom: "D", direction: "toutes" }, "HLS", "syndic")).toBe(true);
  });
});

describe("estDirectionCles : diriger une activite n'est pas administrer", () => {
  it("Nadine n'administre pas les cles d'ASN", () => {
    expect(estDirectionCles(NADINE, "ASN")).toBe(false);
    expect(estDirectionCles(CHRYSTELLE, "ASN")).toBe(false);
  });
});

describe("activitesDirigees : le mapping des fonctions", () => {
  it("les encadrants de metier", () => {
    expect(activitesDirigees({ fonction: "responsable_transaction_gestion" })).toEqual(["transaction", "location"]);
    expect(activitesDirigees({ fonction: "directeur_vente" })).toEqual(["transaction"]);
    expect(activitesDirigees({ fonction: "responsable_gestion_locative" })).toEqual(["location"]);
    expect(activitesDirigees({ fonction: "dirigeant" })).toEqual(["syndic", "location", "transaction"]);
  });

  it("une fonction qui exerce sans diriger, ou inconnue : rien", () => {
    expect(activitesDirigees({ fonction: "gestionnaire_copropriete" })).toEqual([]);
    expect(activitesDirigees({ fonction: "directeur_copropriete" })).toEqual([]);
    expect(activitesDirigees({ fonction: undefined })).toEqual([]);
    expect(activitesDirigees({ fonction: "inexistante" })).toEqual([]);
  });
});

describe("agencesVisibles / agenceAffichee : le choix d'agence du comptoir", () => {
  const DIRECTION: Acteur = { id: "u6", nom: "Emmanuel L.", agence: "LGC", direction: "toutes" };

  it("l'equipe d'une agence ne voit que la sienne : pas de choix", () => {
    expect(agencesVisibles(GESTIONNAIRE_LGC)).toEqual(["LGC"]);
  });

  it("la direction voit les quatre, dans l'ordre du cabinet", () => {
    expect(agencesVisibles(DIRECTION)).toEqual(["ML", "LGC", "HLS", "ASN"]);
  });

  it("une delegation ou un referent ajoute son agence", () => {
    expect(agencesVisibles(CHRYSTELLE)).toEqual(["LGC", "ASN"]);
    expect(agencesVisibles(REFERENT_ASN)).toEqual(["ML", "ASN"]);
  });

  it("qui dirige une activite voit les quatre : ses trousseaux sont partout", () => {
    expect(agencesVisibles(NADINE)).toEqual(["ML", "LGC", "HLS", "ASN"]);
  });

  it("l'agence demandee si elle est visible, sinon la sienne", () => {
    expect(agenceAffichee(DIRECTION, "hls")).toBe("HLS");
    expect(agenceAffichee(DIRECTION, undefined)).toBe("LGC");
    expect(agenceAffichee(GESTIONNAIRE_LGC, "HLS")).toBe("LGC");
    expect(agenceAffichee(DIRECTION, "XYZ")).toBe("LGC");
  });

  it("sans agence ni demande : tout le cabinet (undefined), comme avant", () => {
    expect(agenceAffichee({ id: "u7", nom: "Sans agence", direction: "toutes" }, undefined)).toBeUndefined();
  });
});
