// La file a trier lit l'index de la reception (REA-419) : toute la reception depuis la mise en
// service, les plus anciens en haut, sans les mails sortis ni les mails deja ranges ; repli
// sur la lecture directe tant que la table n'existe pas. Et la pastille compte la meme chose.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawMail } from "@/lib/domain/tri-mail/raw-mail";
import { IndexReceptionAbsent, type ReceptionIndex } from "@/lib/ports/reception-index";
import { MemoireReceptionIndex } from "@/lib/adapters/mock/memoire-reception-index";
import { MockTriRepository } from "@/lib/adapters/mock/mock-tri-repository";
import { MockReferentielTri } from "@/lib/adapters/mock/mock-referentiel-tri";

const etat: { index: ReceptionIndex; repo: MockTriRepository } = { index: new MemoireReceptionIndex(), repo: new MockTriRepository() };
const lireRecents = vi.fn();
const compterReception = vi.fn();
const lireDelta = vi.fn();

vi.mock("@/lib/adapters/router", () => ({
  getIngestionTri: () => ({ lireRecents, compterReception }),
  getReceptionIndex: () => etat.index,
  getReceptionDelta: () => ({ lireDelta }),
  getTriRepository: () => etat.repo,
  getReferentielTriProvider: () => new MockReferentielTri(),
  getRangementTri: () => ({}),
  getGestionnaireRepository: () => ({ listTous: async () => [] }),
}));
vi.mock("@/lib/services/tri-emails/binomes", () => ({ listerCollaborateurs: async () => [], listerGestionnairesCabinet: async () => [] }));
vi.mock("@/lib/observabilite", () => ({ signalerException: () => undefined }));

import { lireFileATrier } from "@/lib/services/tri-emails/lire-file";
import { compterMailsATrier, oublierCompteur } from "@/lib/services/tri-emails/compteur";
import type { BoiteTriConfig } from "@/lib/domain/mail-gate";

const BOITE = "syndic2@real31.fr";
const CONFIG: BoiteTriConfig = { boite: BOITE, agences: ["LGC"], depuis: "2026-10-05", ecriture: true, automatique: false, envoi: false };

let n = 0;
const mail = (jour: string, o: Partial<RawMail> = {}): RawMail => {
  n++;
  return {
    id: `g${n}`,
    internetMessageId: `<m${n}@exemple.fr>`,
    from: `x${n}@exemple.fr`,
    to: [BOITE],
    subject: `Objet ${n}`,
    receivedAt: `2026-10-${jour}T08:00:00Z`,
    bodyText: "Bonjour",
    copro: "",
    attachments: [],
    ...o,
  };
};

beforeEach(() => {
  vi.stubEnv("MAIL_TRI_BOITES", JSON.stringify([CONFIG]));
  // Ecriture coupee : simulation, comme en local.
  vi.stubEnv("MAIL_TRI_ECRITURE", "");
  etat.index = new MemoireReceptionIndex();
  etat.repo = new MockTriRepository();
  oublierCompteur(BOITE);
});
afterEach(() => {
  vi.unstubAllEnvs();
  lireRecents.mockReset();
  compterReception.mockReset();
  lireDelta.mockReset();
});

describe("lireFileATrier sur l'index de la reception", () => {
  it("toute la reception, les plus anciens en haut, sans les sortis ni les deja ranges", async () => {
    const recent = mail("26");
    const ancien = mail("06");
    const milieu = mail("15");
    const sorti = mail("10");
    const range = mail("12");
    await etat.index.appliquer(BOITE, { ajoutes: [recent, ancien, milieu, sorti, range], retires: [] });
    await etat.index.sortir(BOITE, [sorti.internetMessageId]);
    await etat.index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    await etat.repo.journaliser({
      boite: BOITE, internetMessageId: range.internetMessageId, messageId: range.id, expediteur: range.from, objet: range.subject,
      coproReference: null, copros: [], dossierNom: "Divers", dossierCle: "divers", signal: null, candidats: [], simulation: true, par: "sekou",
    });

    const file = await lireFileATrier(CONFIG);
    expect(file.mails.map((m) => m.id)).toEqual([ancien.id, milieu.id, recent.id]);
    expect(file).toMatchObject({ source: "index", tronquee: false, totalReception: null });
    expect(file.synchroniseLe).not.toBeNull();
    // L'index etait frais : pas de relecture de la boite.
    expect(lireDelta).not.toHaveBeenCalled();
    expect(lireRecents).not.toHaveBeenCalled();
    // La pastille compte l'index (le mail range en simulation est toujours dans la boite).
    expect(await compterMailsATrier(BOITE)).toBe(4);
    expect(compterReception).not.toHaveBeenCalled();
  });

  it("plus de 100 mails : tous dans la file", async () => {
    const mails = Array.from({ length: 130 }, (_, i) => mail(String(6 + (i % 20)).padStart(2, "0")));
    await etat.index.appliquer(BOITE, { ajoutes: mails, retires: [] });
    await etat.index.enregistrerJetonDelta(BOITE, { jeton: "delta-1" });
    const file = await lireFileATrier(CONFIG);
    expect(file.mails).toHaveLength(130);
    expect(file.mails[0]!.recuLe <= file.mails[129]!.recuLe).toBe(true);
  });

  it("index jamais lu : la boite est relue a l'ouverture, puis affichee", async () => {
    const m = mail("20");
    lireDelta.mockResolvedValue({ ajoutes: [m], retires: [], pages: 1, jeton: "delta-1", complet: true, reinitialise: true });
    const file = await lireFileATrier(CONFIG);
    expect(lireDelta).toHaveBeenCalledTimes(1);
    expect(lireDelta.mock.calls[0]![1]).toMatchObject({ jeton: null, budgetMs: 5_000 });
    expect(file.mails.map((x) => x.id)).toEqual([m.id]);
    expect(file.erreur).toBeNull();
  });

  it("la relecture echoue : avertissement, et l'index tel quel", async () => {
    const m = mail("20");
    await etat.index.appliquer(BOITE, { ajoutes: [m], retires: [] });
    lireDelta.mockRejectedValue(new Error("Graph delta 503"));
    const file = await lireFileATrier(CONFIG);
    expect(file.mails.map((x) => x.id)).toEqual([m.id]);
    expect(file.erreur).toContain("dernière lecture");
  });

  it("table absente : repli sur les 100 plus recents de la boite, remis dans l'ordre d'arrivee", async () => {
    etat.index = {
      jetonDelta: async () => Promise.reject(new IndexReceptionAbsent()),
      compter: async () => Promise.reject(new IndexReceptionAbsent()),
    } as unknown as ReceptionIndex;
    const a = mail("20");
    const b = mail("21");
    lireRecents.mockResolvedValue([b, a]);
    compterReception.mockResolvedValue(2);
    const file = await lireFileATrier(CONFIG);
    expect(file.source).toBe("direct");
    expect(file.mails.map((x) => x.id)).toEqual([a.id, b.id]);
    expect(file.tronquee).toBe(false);
    expect(await compterMailsATrier(BOITE)).toBe(2);
    expect(compterReception).toHaveBeenCalledWith(BOITE, "2026-10-04T22:00:00Z");
  });
});
