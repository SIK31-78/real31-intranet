// Adapter eStale du CondoEstaleProvider (Phase B, ADR-022) : Conseil Syndical
// (Condo.council), historique des AG (Condo.meetings). La copro est resolue par
// REFERENCE NORMALISEE (S0299 -> S299) via me.collaborator.condos : pas de query
// liste cross-copros dans l'API, et les references font foi (decision Sekou
// 2026-06-12 ; externalIdEstale non utilise pour l'instant).

import type { CondoEstaleProvider } from "@/lib/ports/condo-estale-provider";
import type {
  AgPassee,
  DonneesEstaleCopro,
  MembreConseilSyndical,
} from "@/lib/domain/copropriete";
import { estaleGql } from "./client";

// --- Resolution reference -> condo id (cache module, TTL court) -------------

type CondoRef = { id: string; reference: string };
let cacheCondos: { liste: CondoRef[]; expire: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/** "S0299" / "s299 " -> "S299" : prefixe lettre + numero sans zeros de tete. */
function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

async function resoudreCondoId(code: string): Promise<string | null> {
  if (!cacheCondos || Date.now() > cacheCondos.expire) {
    const data = await estaleGql<{ me: { collaborator: { condos: CondoRef[] } } }>(
      `{ me { collaborator { condos(archived: false) { id reference } } } }`,
    );
    cacheCondos = { liste: data.me.collaborator.condos, expire: Date.now() + TTL_MS };
  }
  const cible = normaliserRef(code);
  return cacheCondos.liste.find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
}

// --- Donnees condo -----------------------------------------------------------

type CondoData = {
  condo: {
    council: {
      role: "PRESIDENT" | "MEMBER";
      expiry: number | null;
      owner: { fullname: string };
    }[];
    meetings: {
      category: string;
      startAt: string | null;
      transcript: { validated: boolean };
    }[];
  };
};

const QUERY_CONDO = `query DonneesCopro($id: ID!) {
  condo(id: $id) {
    council { role expiry owner { fullname } }
    meetings { category startAt transcript { validated } }
  }
}`;

/** ORDINARY -> AG ; tout le reste (EXTRAORDINARY, URGENT, SPECIAL...) -> AGE. */
function typeAg(category: string): "AG" | "AGE" {
  return category === "ORDINARY" ? "AG" : "AGE";
}

export class EstaleCondoProvider implements CondoEstaleProvider {
  async getDonneesCopro(code: string): Promise<DonneesEstaleCopro | null> {
    const condoId = await resoudreCondoId(code);
    if (!condoId) return null; // copro pas (encore) sur eStale -> blocs "a venir"

    const { condo } = await estaleGql<CondoData>(QUERY_CONDO, { id: condoId });

    const conseilSyndical: MembreConseilSyndical[] = condo.council
      .map((c) => ({
        nomComplet: c.owner.fullname,
        role: c.role === "PRESIDENT" ? ("president" as const) : ("membre" as const),
      }))
      // President en premier, puis alphabetique.
      .sort((a, b) =>
        a.role === b.role ? a.nomComplet.localeCompare(b.nomComplet) : a.role === "president" ? -1 : 1,
      );

    // Echeance du mandat : l'expiry max des membres (annee), si renseigne.
    const expiry = Math.max(0, ...condo.council.map((c) => c.expiry ?? 0));

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const historiqueAg: AgPassee[] = condo.meetings
      .filter((m) => m.startAt && m.startAt.slice(0, 10) <= aujourdhui)
      .map((m) => ({
        date: m.startAt!.slice(0, 10),
        type: typeAg(m.category),
        pvDispo: m.transcript.validated,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      conseilSyndical,
      ...(expiry > 0 ? { mandatJusqua: `AG ${expiry}` } : {}),
      historiqueAg,
      conformite: [], // la conformite (PPT...) reste composee depuis le referentiel
    };
  }
}
