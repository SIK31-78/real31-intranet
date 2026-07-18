// Tests du BONUS EMAIL : envoi de la fiche de renseignements par email vs courrier. Adapter
// memoire (aucun reseau). Donnees SYNTHETIQUES.
import { describe, expect, it } from "vitest";
import { FicheRenseignementsRepositoryMemoire } from "@/lib/reprise/adapters/memoire/fiche-renseignements-repository-memoire";
import { envoyerFicheParEmail, emailValide } from "../fiches-renseignements";
import { creerDossier, type Dossier } from "@/lib/reprise/domain/dossier";

const NOW = "2026-07-16T10:00:00.000Z";
const BASE = "https://intranet.test";

function dossier(email?: string): Dossier {
  const d = creerDossier("S9999", "Copro test");
  d.jeu = {
    lots: [],
    cles: [],
    tantiemes: [],
    owners: [{ id: "o1", civilite: "m", nom: "MARTIN", prenom: "Paul", pro: false, ...(email ? { email } : {}) }],
    attributions: [],
  };
  return d;
}

describe("emailValide", () => {
  it("valide une adresse plausible, rejette le reste", () => {
    expect(emailValide("paul@example.test")).toBe(true);
    expect(emailValide("pasunemail")).toBe(false);
    expect(emailValide(undefined)).toBe(false);
  });
});

describe("envoyerFicheParEmail", () => {
  it("owner avec email : genere la fiche (canal email) et envoie le mail avec lien + code", async () => {
    const repo = new FicheRenseignementsRepositoryMemoire();
    let capture: { email: string; sujet: string; corps: string } | null = null;
    const envoyerMail = async (p: { email: string; destinataire: string; sujet: string; corps: string }) => {
      capture = { email: p.email, sujet: p.sujet, corps: p.corps };
      return { envoye: true };
    };

    const r = await envoyerFicheParEmail(repo, dossier("paul@example.test"), "o1", { baseUrl: BASE, nowISO: NOW }, envoyerMail);
    expect(r.ok).toBe(true);
    expect(r.envoye).toBe(true);
    expect(capture!.email).toBe("paul@example.test");
    // Le corps porte le lien tokenise + un code (contenu du courrier, sans QR).
    expect(capture!.corps).toContain(`${BASE}/fiche/`);
    expect(capture!.corps).toMatch(/code personnel/i);

    const fiches = await repo.listerParDossier("S9999");
    expect(fiches).toHaveLength(1);
    expect(fiches[0].canal).toBe("email");
    expect(fiches[0].envoiEmailAt).toBe(NOW);
  });

  it("owner SANS email : refuse (reste au courrier)", async () => {
    const repo = new FicheRenseignementsRepositoryMemoire();
    const envoyerMail = async () => ({ envoye: true });
    const r = await envoyerFicheParEmail(repo, dossier(), "o1", { baseUrl: BASE, nowISO: NOW }, envoyerMail);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/courrier/i);
    expect(await repo.listerParDossier("S9999")).toHaveLength(0);
  });

  it("mail inactif : fiche prete (lien valide) mais mail non parti", async () => {
    const repo = new FicheRenseignementsRepositoryMemoire();
    const envoyerMail = async () => ({ envoye: false, note: "module inactif" });
    const r = await envoyerFicheParEmail(repo, dossier("paul@example.test"), "o1", { baseUrl: BASE, nowISO: NOW }, envoyerMail);
    expect(r.ok).toBe(true);
    expect(r.envoye).toBe(false);
    expect(r.note).toMatch(/inactif/i);
    // La fiche est persistee (le lien marche) mais sans envoiEmailAt.
    const fiches = await repo.listerParDossier("S9999");
    expect(fiches[0].canal).toBe("email");
    expect(fiches[0].envoiEmailAt).toBeUndefined();
  });

  it("owner ayant deja repondu : rien a renvoyer", async () => {
    const repo = new FicheRenseignementsRepositoryMemoire();
    const envoyerMail = async () => ({ envoye: true });
    // Premiere fiche generee puis marquee soumise.
    await envoyerFicheParEmail(repo, dossier("paul@example.test"), "o1", { baseUrl: BASE, nowISO: NOW }, envoyerMail);
    const f = (await repo.listerParDossier("S9999"))[0];
    await repo.sauver({ ...f, statut: "soumis" });

    const r = await envoyerFicheParEmail(repo, dossier("paul@example.test"), "o1", { baseUrl: BASE, nowISO: NOW }, envoyerMail);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/deja repondu/i);
  });
});
