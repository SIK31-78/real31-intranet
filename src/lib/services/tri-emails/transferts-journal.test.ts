import { describe, expect, it, vi } from "vitest";

// Les destinataires de la colonne « Transférés » du journal du tri (REA-500) : relus dans les
// notes « Transféré à … », en une lecture groupée, pour les seules lignes de ce dossier.

vi.mock("@/lib/adapters/router", () => ({ getBoiteEquipeRepository: () => ({ notesDe: async () => [] }) }));

import type { NoteInterne } from "@/lib/domain/boite-equipe";
import { destinatairesDesTransferts } from "./transferts-journal";

const ligne = (id: string, internetMessageId: string, dossierCle: string | null, faitLe = "2026-11-06T09:00:00Z") => ({
  id,
  internetMessageId,
  dossierCle,
  faitLe,
});

const note = (internetMessageId: string, texte: string, creeLe = "2026-11-06T09:00:03Z"): NoteInterne => ({
  id: `n-${internetMessageId}-${creeLe}`,
  internetMessageId,
  boite: "syndic2@real31.fr",
  auteurId: "u1",
  auteurEmail: "camille@real31.fr",
  auteurNom: "Camille TEST",
  auteurInitiales: "CT",
  texte,
  creeLe,
  modifieLe: null,
});

describe("destinatairesDesTransferts", () => {
  it("une seule lecture, pour les seules lignes « Transférés », sans doublon d'identifiant", async () => {
    const notesDe = vi.fn(async () => [
      note("<m1@exemple.fr>", "Transféré à vente@real31.fr (Cc : accueil@real31.fr) par Camille TEST."),
      note("<m1@exemple.fr>", "Le client rappelle demain."),
      note("<m3@exemple.fr>", "Transféré à location@real31.fr par Camille TEST."),
    ]);
    const journal = [
      ligne("j1", "<m1@exemple.fr>", "transferes"),
      ligne("j2", "<m2@exemple.fr>", "divers"),
      ligne("j3", "<m3@exemple.fr>", "transferes"),
      ligne("j4", "<m3@exemple.fr>", "transferes", "2026-11-05T09:00:00Z"),
      ligne("j5", "<m5@exemple.fr>", "transferes"),
    ];
    expect(await destinatairesDesTransferts(journal, { notesDe })).toEqual({
      j1: ["vente@real31.fr", "accueil@real31.fr"],
      j3: ["location@real31.fr"],
      j4: ["location@real31.fr"],
    });
    expect(notesDe).toHaveBeenCalledTimes(1);
    expect(notesDe).toHaveBeenCalledWith(["<m1@exemple.fr>", "<m3@exemple.fr>", "<m5@exemple.fr>"]);
  });

  it("aucune ligne « Transférés » : aucune lecture", async () => {
    const notesDe = vi.fn(async () => []);
    expect(await destinatairesDesTransferts([ligne("j2", "<m2@exemple.fr>", "divers")], { notesDe })).toEqual({});
    expect(notesDe).not.toHaveBeenCalled();
  });

  it("table absente ou en panne : le journal s'affiche sans destinataires", async () => {
    const journal = [ligne("j1", "<m1@exemple.fr>", "transferes")];
    expect(await destinatairesDesTransferts(journal, { notesDe: async () => null })).toEqual({});
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await destinatairesDesTransferts(journal, { notesDe: async () => Promise.reject(new Error("panne")) })).toEqual({});
  });
});
