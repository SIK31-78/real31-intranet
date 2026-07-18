// Tests du service fiches de renseignements (offline, repo memoire, aucun reseau). Donnees
// SYNTHETIQUES. Couvre : generation (secrets uniques, snapshot), anti-enumeration du code,
// soumission unique, validation (eStale via port dry-run + callback mail), flux relance.
import { describe, expect, it } from "vitest";
import {
  genererCourriers,
  consulterFiche,
  soumettreFiche,
  validerFiche,
} from "../fiches-renseignements";
import { hacher } from "../fiche-token";
import { FicheRenseignementsRepositoryMemoire } from "@/lib/reprise/adapters/memoire/fiche-renseignements-repository-memoire";
import { DryRunEstaleFicheContactProvider } from "@/lib/reprise/adapters/estale-fiche-contact/dry-run-provider";
import type { Dossier } from "@/lib/reprise/domain/dossier";
import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";

const NOW = "2026-02-01T00:00:00.000Z";

function jeu(): JeuDeDonnees {
  return {
    lots: [],
    cles: [],
    tantiemes: [],
    owners: [
      { id: "o1", civilite: "m", nom: "DURAND", prenom: "Jean", pro: false, adrNum: "12", adrVoie: "rue Test", adrCodePostal: "75000", adrVille: "PARIS" },
      { id: "o2", civilite: "mme", nom: "MARTIN", pro: false },
    ],
    attributions: [
      { ownerId: "o1", lot: 3 },
      { ownerId: "o1", lot: 7 },
    ],
  };
}

function dossier(): Dossier {
  return {
    ref: "S9999",
    nomUsuel: "Residence des Lilas",
    statut: "production",
    etapes: [],
    compteurs: {},
    anomalies: [],
    journal: [],
    jeu: jeu(),
  };
}

// genererCourriers renvoie les secrets EN CLAIR : on les capture pour piloter le reste.
async function preparer() {
  const repo = new FicheRenseignementsRepositoryMemoire();
  const r = await genererCourriers(repo, dossier(), { baseUrl: "https://x.test", nowISO: NOW });
  return { repo, r };
}

describe("generation", () => {
  it("cree une fiche par owner avec token/code uniques + snapshot + lots", async () => {
    const { r } = await preparer();
    expect(r.courriers).toHaveLength(2);
    const o1 = r.courriers.find((c) => c.ownerId === "o1")!;
    expect(o1.lien).toContain("/fiche/");
    expect(o1.code).toMatch(/^[0-9A-Z]{8}$/);
    expect(o1.connues.lots).toEqual([3, 7]);
    // Tokens et codes distincts entre owners.
    const [a, b] = r.courriers;
    expect(a.lien).not.toBe(b.lien);
    expect(a.code).not.toBe(b.code);
  });
});

describe("anti-enumeration + consultation", () => {
  it("token inconnu -> raison 'code' (jamais 'introuvable')", async () => {
    const { repo } = await preparer();
    const res = await consulterFiche(repo, hacher("token-bidon"), "XXXX", NOW);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.raison).toBe("code");
  });

  it("mauvais code -> refus ; bon code -> vue avec PII", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    const mauvais = await consulterFiche(repo, tokenHash, "00000000", NOW);
    expect(mauvais.ok).toBe(false);
    const bon = await consulterFiche(repo, tokenHash, c.code, NOW);
    expect(bon.ok).toBe(true);
    if (bon.ok) {
      expect(bon.soumissionPossible).toBe(true);
      expect(bon.connues.nom).toBe("DURAND");
    }
  });

  it("code tolere minuscules/espaces (normalisation)", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    const res = await consulterFiche(repo, tokenHash, ` ${c.code.toLowerCase()} `, NOW);
    expect(res.ok).toBe(true);
  });
});

describe("soumission unique", () => {
  it("enregistre puis refuse une seconde soumission", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    const s1 = await soumettreFiche(repo, tokenHash, c.code, { email: "jean@example.test" }, NOW);
    expect(s1.ok).toBe(true);
    const s2 = await soumettreFiche(repo, tokenHash, c.code, { email: "autre@example.test" }, NOW);
    expect(s2.ok).toBe(false);
    if (!s2.ok) expect(s2.raison).toBe("deja_soumis");
    // Consultation apres soumission : read-only.
    const vue = await consulterFiche(repo, tokenHash, c.code, NOW);
    expect(vue.ok && vue.soumissionPossible).toBe(false);
    if (vue.ok) expect(vue.soumises?.email).toBe("jean@example.test");
  });

  it("refuse une soumission expiree", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    const tard = "2026-08-01T00:00:00.000Z"; // > 90 jours
    const s = await soumettreFiche(repo, tokenHash, c.code, { email: "jean@example.test" }, tard);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.raison).toBe("expiree");
  });
});

describe("validation", () => {
  it("dry-run eStale + mail via callback -> statut valide", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    await soumettreFiche(repo, tokenHash, c.code, { email: "jean@example.test" }, NOW);

    let mailEnvoye: { email: string } | null = null;
    const res = await validerFiche(
      repo,
      new DryRunEstaleFicheContactProvider(),
      "o1",
      "S9999",
      async (p) => {
        mailEnvoye = p;
        return { envoye: true };
      },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(res.estale?.applique).toBe(false); // dry-run
    expect(res.mailEnvoye).toBe(true);
    expect(mailEnvoye!.email).toBe("jean@example.test");

    // Re-validation refusee (deja valide).
    const rebis = await validerFiche(repo, new DryRunEstaleFicheContactProvider(), "o1", "S9999", async () => ({ envoye: true }), NOW);
    expect(rebis.ok).toBe(false);
  });

  it("mail inactif -> valide quand meme, mailEnvoye=false + note", async () => {
    const { repo, r } = await preparer();
    const c = r.courriers[0];
    const tokenHash = hacher(c.lien.split("/fiche/")[1]);
    await soumettreFiche(repo, tokenHash, c.code, { email: "jean@example.test" }, NOW);
    const res = await validerFiche(
      repo,
      new DryRunEstaleFicheContactProvider(),
      "o1",
      "S9999",
      async () => ({ envoye: false, note: "module inactif" }),
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(res.mailEnvoye).toBe(false);
    expect(res.mailNote).toBe("module inactif");
  });
});

describe("relance", () => {
  it("ne regenere pas les fiches deja soumises (ignores), regenere les non-repondants", async () => {
    const repo = new FicheRenseignementsRepositoryMemoire();
    const d = dossier();
    const gen1 = await genererCourriers(repo, d, { baseUrl: "https://x.test", nowISO: NOW });
    // o1 repond.
    const c1 = gen1.courriers.find((c) => c.ownerId === "o1")!;
    const th1 = hacher(c1.lien.split("/fiche/")[1]);
    await soumettreFiche(repo, th1, c1.code, { email: "jean@example.test" }, NOW);

    const relance = await genererCourriers(repo, d, { baseUrl: "https://x.test", nowISO: NOW, relance: true });
    // o1 ignore (deja soumis), o2 regenere.
    expect(relance.ignores).toBe(1);
    expect(relance.courriers.map((c) => c.ownerId)).toEqual(["o2"]);
    expect(relance.courriers[0].relance).toBe(true);
  });
});
