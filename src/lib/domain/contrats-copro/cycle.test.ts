import { describe, expect, it } from "vitest";
import {
  cycleInitial,
  demarrer,
  echeanceApresCloture,
  heritageOffreAssurance,
  heritageOffreGaz,
  peutEffacerEtape,
  peutRetirerOffre,
  preparerCloture,
  verifierDateEtape,
} from "./cycle";
import type { Cycle, OffreAssurance, OffreGaz } from "./types";

const AUJ = "2026-05-17";

function cycle(over: Partial<Cycle> = {}): Cycle {
  return {
    id: "c1",
    sujet: "ctq_ascenseur",
    coproCode: "S0247",
    ascenseurId: "asc1",
    statut: "en_cours",
    echeanceISO: "2026-06-30",
    etapes: { devis_demande: "2026-02-01", devis_valide: "2026-04-01" },
    demarreManuellement: null,
    offreRetenueId: null,
    creeLeISO: "2021-06-30",
    ...over,
  };
}

const OFFRE_GAZ: OffreGaz = { id: "o2", cycleId: "c1", fournisseur: "Engie", typePrix: "fixe", montant: 12_480.5, dureeMois: 24, recueLeISO: "2026-04-10" };
const OFFRE_ASSURANCE: OffreAssurance = { id: "oa1", cycleId: "c1", assureur: "AXA", prime: 4250, franchise: 500, garanties: null, recueLeISO: "2026-04-10" };

describe("verifierDateEtape (D7)", () => {
  it("refuse l'illisible et le futur, accepte le passé et le jour même", () => {
    expect(verifierDateEtape("demain", AUJ)).toMatch(/illisible/);
    expect(verifierDateEtape("2026-05-18", AUJ)).toMatch(/futur/);
    expect(verifierDateEtape("2026-05-17", AUJ)).toBeNull();
    expect(verifierDateEtape("2026-01-02", AUJ)).toBeNull();
  });
});

describe("peutEffacerEtape (D7)", () => {
  it("intermédiaires et post-terminales oui, terminale non, inconnue non", () => {
    expect(peutEffacerEtape("assurance", "offres_demandees")).toBe(true);
    expect(peutEffacerEtape("assurance", "validee")).toBe(false);
    expect(peutEffacerEtape("ctq_vmc", "ctq_realise")).toBe(false);
    expect(peutEffacerEtape("ctq_vmc", "transmis_entreprise")).toBe(true);
    expect(peutEffacerEtape("gaz", "n_existe_pas")).toBe(false);
  });
});

describe("echeanceApresCloture", () => {
  it("CTQ : cinq ans ; gaz : la durée de l'offre ; assurance : la saisie future", () => {
    expect(echeanceApresCloture("ctq_ascenseur", { dateTerminaleISO: "2026-03-12" })).toBe("2031-03-12");
    expect(echeanceApresCloture("ctq_vmc", { dateTerminaleISO: "2024-02-29" })).toBe("2029-02-28");
    expect(echeanceApresCloture("gaz", { dateTerminaleISO: "2026-01-31", dureeMois: 36 })).toBe("2029-01-31");
    expect(echeanceApresCloture("gaz", { dateTerminaleISO: "2026-01-31", dureeMois: 1 })).toBe("2026-02-28");
    expect(echeanceApresCloture("assurance", { dateTerminaleISO: "2026-05-10", echeanceSaisieISO: "2027-03-01" })).toBe("2027-03-01");
  });
  it("null quand l'intrant manque ou n'a pas de sens", () => {
    expect(echeanceApresCloture("gaz", { dateTerminaleISO: "2026-01-31" })).toBeNull();
    expect(echeanceApresCloture("gaz", { dateTerminaleISO: "2026-01-31", dureeMois: 0 })).toBeNull();
    expect(echeanceApresCloture("assurance", { dateTerminaleISO: "2026-05-10" })).toBeNull();
    expect(echeanceApresCloture("assurance", { dateTerminaleISO: "2026-05-10", echeanceSaisieISO: "2026-05-01" })).toBeNull();
    expect(echeanceApresCloture("ctq_vmc", { dateTerminaleISO: "pas une date" })).toBeNull();
  });
});

describe("preparerCloture : CTQ ascenseur", () => {
  it("D3 : première clôture = clos + suivant du même appareil, étapes vides, échéance à cinq ans", () => {
    const r = preparerCloture(cycle(), { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.reCloture).toBe(false);
    expect(r.cloture.clos.statut).toBe("clos");
    expect(r.cloture.clos.etapes.ctq_realise).toBe("2026-05-10");
    expect(r.cloture.clos.etapes.devis_demande).toBe("2026-02-01");
    expect(r.cloture.suivantAjuste).toBeUndefined();
    expect(r.cloture.suivant).toEqual({
      sujet: "ctq_ascenseur",
      coproCode: "S0247",
      ascenseurId: "asc1",
      statut: "en_cours",
      echeanceISO: "2031-05-10",
      etapes: {},
      demarreManuellement: null,
      offreRetenueId: null,
      notes: null,
    });
    expect(r.nouveauDernierCtqISO).toBe("2026-05-10");
    expect(r.patchContrat).toBeUndefined();
  });

  it("D4/D9 : re-clôture = on ajuste la seule échéance du suivant, rien n'est créé", () => {
    const suivant = cycle({ id: "c2", echeanceISO: "2031-05-10", etapes: { devis_demande: "2026-05-15" } });
    const r = preparerCloture(cycle({ statut: "clos", etapes: { ctq_realise: "2026-05-10" } }), {
      dateTerminaleISO: "2026-05-12",
      aujourdhuiISO: AUJ,
      suivantExistant: suivant,
    });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.reCloture).toBe(true);
    expect(r.cloture.suivant).toBeUndefined();
    expect(r.cloture.suivantAjuste).toEqual({ id: "c2", sujet: "ctq_ascenseur", echeanceISO: "2031-05-12" });
    expect(r.cloture.clos.etapes.ctq_realise).toBe("2026-05-12");
    expect(r.nouveauDernierCtqISO).toBe("2026-05-12");
    // les étapes du suivant ne sont pas touchées : la préparation n'en parle même pas
    expect(suivant.etapes.devis_demande).toBe("2026-05-15");
  });

  it("D7 : pas de date future ; un suivi archivé ne se clôture pas", () => {
    expect(preparerCloture(cycle(), { dateTerminaleISO: "2026-06-01", aujourdhuiISO: AUJ })).toEqual({ ok: false, erreur: expect.stringMatching(/futur/) });
    expect(preparerCloture(cycle({ statut: "archive" }), { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ })).toEqual({ ok: false, erreur: expect.stringMatching(/archivé/) });
  });
});

describe("preparerCloture : CTQ VMC", () => {
  it("la date du contrôle part dans le patch du contrat courant", () => {
    const r = preparerCloture(cycle({ sujet: "ctq_vmc", ascenseurId: undefined }), { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.patchContrat).toEqual({ vmc: { dernierCtqISO: "2026-05-10" } });
    expect(r.nouveauDernierCtqISO).toBeUndefined();
    expect(r.cloture.suivant?.ascenseurId).toBeUndefined();
    expect(r.cloture.suivant?.echeanceISO).toBe("2031-05-10");
  });
});

describe("preparerCloture : gaz", () => {
  const gaz = cycle({ sujet: "gaz", ascenseurId: undefined, etapes: { devis_demande: "2026-02-01" } });

  it("D5/D10 : l'offre est obligatoire, sa durée aussi", () => {
    expect(preparerCloture(gaz, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, dureeMois: 24 })).toEqual({ ok: false, erreur: expect.stringMatching(/offre/) });
    expect(preparerCloture(gaz, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, offreRetenueId: "o2" })).toEqual({ ok: false, erreur: expect.stringMatching(/durée/) });
  });

  it("D10 : clôture = offre posée sur le clos, échéance = validation + durée", () => {
    const r = preparerCloture(gaz, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, offreRetenueId: "o2", dureeMois: 24 });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.cloture.clos.offreRetenueId).toBe("o2");
    expect(r.cloture.clos.etapes.validee).toBe("2026-05-10");
    expect(r.cloture.suivant?.echeanceISO).toBe("2028-05-10");
    expect(r.cloture.suivant?.offreRetenueId).toBeNull();
    expect(r.patchContrat).toBeUndefined(); // l'héritage vient de heritageOffreGaz, côté service
  });

  it("D11 : re-clôture avec changement d'offre : nouvelle offre sur le clos, échéance du suivant recalculée", () => {
    const suivant = cycle({ id: "c2", sujet: "gaz", ascenseurId: undefined, echeanceISO: "2029-05-10", etapes: { devis_demande: "2026-06-01" } });
    const r = preparerCloture(
      { ...gaz, statut: "clos", offreRetenueId: "o1", etapes: { ...gaz.etapes, validee: "2026-05-10" } },
      { dateTerminaleISO: "2026-05-12", aujourdhuiISO: AUJ, offreRetenueId: "o2", dureeMois: 12, suivantExistant: suivant },
    );
    if (!r.ok) throw new Error(r.erreur);
    expect(r.reCloture).toBe(true);
    expect(r.cloture.clos.offreRetenueId).toBe("o2");
    expect(r.cloture.clos.etapes.validee).toBe("2026-05-12");
    expect(r.cloture.suivant).toBeUndefined();
    expect(r.cloture.suivantAjuste).toEqual({ id: "c2", sujet: "gaz", echeanceISO: "2027-05-12" });
  });

  it("heritageOffreGaz : les quatre champs recopiés, échéance comprise", () => {
    expect(heritageOffreGaz(OFFRE_GAZ, "2026-05-12")).toEqual({
      gaz: { fournisseur: "Engie", typePrix: "fixe", montant: 12_480.5, echeanceISO: "2028-05-12" },
    });
  });
});

describe("preparerCloture : assurance", () => {
  const assurance = cycle({ sujet: "assurance", ascenseurId: undefined, etapes: { offres_presentees: "2026-04-20" } });

  it("D6/D12 : l'échéance est saisie et doit être future", () => {
    expect(preparerCloture(assurance, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ })).toEqual({ ok: false, erreur: expect.stringMatching(/échéance/i) });
    expect(preparerCloture(assurance, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, echeanceSaisieISO: "2026-05-17" })).toEqual({ ok: false, erreur: expect.stringMatching(/futur/) });
  });

  it("D12-1 : clôture SANS offre (reconduction) : pas de marqueur, échéance saisie sur le suivant", () => {
    const r = preparerCloture(assurance, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, echeanceSaisieISO: "2027-03-01" });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.cloture.clos.offreRetenueId).toBeNull();
    expect(r.cloture.clos.etapes.validee).toBe("2026-05-10");
    expect(r.cloture.suivant?.echeanceISO).toBe("2027-03-01");
    expect(heritageOffreAssurance(null, "2027-03-01")).toEqual({ assurance: { echeanceISO: "2027-03-01" } });
  });

  it("D12 : clôture AVEC offre : marqueur posé, compagnie héritée, numéro si fourni", () => {
    const r = preparerCloture(assurance, { dateTerminaleISO: "2026-05-10", aujourdhuiISO: AUJ, echeanceSaisieISO: "2027-03-01", offreRetenueId: "oa1" });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.cloture.clos.offreRetenueId).toBe("oa1");
    expect(heritageOffreAssurance(OFFRE_ASSURANCE, "2027-03-01", " 123-456 ")).toEqual({
      assurance: { echeanceISO: "2027-03-01", compagnie: "AXA", numeroContrat: "123-456" },
    });
  });

  it("D12-5 : un numéro absent ou vide n'écrase jamais le numéro existant", () => {
    expect(heritageOffreAssurance(OFFRE_ASSURANCE, "2027-03-01", "")).toEqual({ assurance: { echeanceISO: "2027-03-01", compagnie: "AXA" } });
    expect(heritageOffreAssurance(OFFRE_ASSURANCE, "2027-03-01", null)).toEqual({ assurance: { echeanceISO: "2027-03-01", compagnie: "AXA" } });
  });

  it("D12 (re-clôture) : offre absente = offre retenue inchangée ; la re-saisie de l'échéance ajuste le suivant", () => {
    const suivant = cycle({ id: "c2", sujet: "assurance", ascenseurId: undefined, echeanceISO: "2027-03-01", etapes: { sinistralite_demandee: "2026-06-01" } });
    const r = preparerCloture(
      { ...assurance, statut: "clos", offreRetenueId: "oa1", etapes: { ...assurance.etapes, validee: "2026-05-10" } },
      { dateTerminaleISO: "2026-05-11", aujourdhuiISO: AUJ, echeanceSaisieISO: "2027-04-01", suivantExistant: suivant },
    );
    if (!r.ok) throw new Error(r.erreur);
    expect(r.cloture.clos.offreRetenueId).toBe("oa1");
    expect(r.cloture.suivantAjuste).toEqual({ id: "c2", sujet: "assurance", echeanceISO: "2027-04-01" });
    expect(r.cloture.suivant).toBeUndefined();
  });
});

describe("peutRetirerOffre (D13)", () => {
  it("l'offre retenue ne se retire pas, les autres oui", () => {
    expect(peutRetirerOffre({ offreRetenueId: "o2" }, "o2")).toMatch(/retenue/);
    expect(peutRetirerOffre({ offreRetenueId: "o2" }, "o1")).toBeNull();
    expect(peutRetirerOffre({ offreRetenueId: null }, "o1")).toBeNull();
  });
});

describe("cycleInitial / demarrer", () => {
  it("le premier cycle d'une copro est démarré à la main, sans étape", () => {
    expect(cycleInitial({ sujet: "gaz", coproCode: "S0247", echeanceISO: null })).toEqual({
      sujet: "gaz",
      coproCode: "S0247",
      statut: "en_cours",
      echeanceISO: null,
      etapes: {},
      demarreManuellement: true,
      offreRetenueId: null,
      notes: null,
    });
    expect(cycleInitial({ sujet: "ctq_ascenseur", coproCode: "S0247", echeanceISO: "2030-01-01", ascenseurId: "asc9" }).ascenseurId).toBe("asc9");
  });
  it("démarrer un cycle d'amorçage ne change que le drapeau", () => {
    const c = cycle();
    const d = demarrer(c);
    expect(d.demarreManuellement).toBe(true);
    expect(d).toEqual({ ...c, demarreManuellement: true });
    expect(c.demarreManuellement).toBeNull();
  });
});
