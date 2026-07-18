// Normalisation des sorties brutes du modele -> types du domaine, avec application des
// regles cabinet (R6 casse, codes cles prefixes 0, civilite en minuscules, ids stables).
// PUR (aucun reseau) : couche testable PARTAGEE par les adapters d'extraction (Mistral,
// Claude...). La validation des VALEURS (civilite hors liste, ecart de total...) reste aux
// auto-checks deterministes.

import { z } from "zod";
import type { Attribution, Cle, Lot, Owner, Tantieme } from "@/lib/reprise/domain/patrimoine";
import type { ResultatPatrimoine, ResultatProprietaires } from "@/lib/reprise/ports/extraction-provider";
import { formaterCodeCle, toNomMajuscules, toTitleCase } from "@/lib/reprise/domain/regles";

const optStr = z.coerce.string().trim().optional();
const optNum = z.coerce.number().optional();

const LotBrut = z.object({
  numero: z.coerce.number(),
  type: z.coerce.string().default(""),
  usage: z.coerce.string().default("other"),
  escalier: optStr,
  etage: optNum,
  porte: optStr,
  surface: optNum,
  nbPiece: optNum,
  commentaire: z.coerce.string().default(""),
});

const CleBrute = z.object({
  code: z.coerce.string(),
  libelle: z.coerce.string().default(""),
  totalAttendu: z.coerce.number(),
  defaut: z.coerce.boolean().optional(),
  commentaire: optStr,
});

const TantiemeBrut = z.object({
  cleCode: z.coerce.string(),
  lot: z.coerce.number(),
  valeur: z.coerce.number(),
});

const PatrimoineBrut = z.object({
  lots: z.array(LotBrut).default([]),
  cles: z.array(CleBrute).default([]),
  tantiemes: z.array(TantiemeBrut).default([]),
  notes: z.array(z.coerce.string()).default([]),
});

const OwnerBrut = z.object({
  id: optStr,
  civilite: z.coerce.string().default("m"),
  nom: z.coerce.string().default(""),
  prenom: optStr,
  pro: z.coerce.boolean().default(false),
  formeJuridique: optStr,
  raisonSociale: optStr,
  siren: optStr,
  capital: optNum,
  naissance: optStr,
  email: optStr,
  // Adresse postale (souvent presente sur la feuille de presence). Objet optionnel :
  // chaque sous-champ est optionnel, l'objet entier peut manquer.
  adresse: z
    .object({
      num: optStr,
      voie: optStr,
      complement: optStr,
      codePostal: optStr,
      ville: optStr,
      pays: optStr,
    })
    .optional(),
  notes: optStr,
});

const AttributionBrute = z.object({
  ownerId: z.coerce.string(),
  lot: z.coerce.number(),
});

const ProprietairesBrut = z.object({
  owners: z.array(OwnerBrut).default([]),
  attributions: z.array(AttributionBrute).default([]),
  notes: z.array(z.coerce.string()).default([]),
});

export function normaliserPatrimoine(brut: unknown): ResultatPatrimoine {
  const p = PatrimoineBrut.parse(brut);
  const lots: Lot[] = p.lots.map((l) => ({
    numero: l.numero,
    type: l.type,
    // usage en minuscules : la validation liste-fermee est faite par les auto-checks
    usage: l.usage.toLowerCase().trim() as Lot["usage"],
    escalier: l.escalier,
    etage: l.etage,
    porte: l.porte,
    surface: l.surface,
    nbPiece: l.nbPiece,
    commentaire: l.commentaire,
  }));
  const cles: Cle[] = p.cles.map((c) => ({
    code: formaterCodeCle(c.code),
    libelle: c.libelle,
    totalAttendu: c.totalAttendu,
    defaut: c.defaut,
    commentaire: c.commentaire,
  }));
  const tantiemes: Tantieme[] = p.tantiemes.map((t) => ({
    cleCode: formaterCodeCle(t.cleCode),
    lot: t.lot,
    valeur: t.valeur,
  }));
  return { lots, cles, tantiemes, notes: p.notes };
}

export function normaliserProprietaires(brut: unknown): ResultatProprietaires {
  const p = ProprietairesBrut.parse(brut);
  // ids stables : on respecte l'id du modele s'il existe, sinon on en attribue un.
  const owners: Owner[] = p.owners.map((o, i) => ({
    id: o.id && o.id.trim() ? o.id.trim() : `o${i + 1}`,
    civilite: o.civilite.toLowerCase().trim() as Owner["civilite"],
    nom: toNomMajuscules(o.nom),
    prenom: o.prenom ? toTitleCase(o.prenom) : undefined,
    pro: o.pro,
    formeJuridique: o.formeJuridique,
    raisonSociale: o.raisonSociale,
    siren: o.siren,
    capital: o.capital,
    naissance: o.naissance,
    email: o.email,
    adrNum: o.adresse?.num,
    adrVoie: o.adresse?.voie,
    adrComplement: o.adresse?.complement,
    adrCodePostal: o.adresse?.codePostal,
    adrVille: o.adresse?.ville,
    paysAdresse: o.adresse?.pays,
    commentaire: o.notes,
  }));
  const attributions: Attribution[] = p.attributions.map((a) => ({ ownerId: a.ownerId.trim(), lot: a.lot }));
  return { owners, attributions, notes: p.notes };
}
