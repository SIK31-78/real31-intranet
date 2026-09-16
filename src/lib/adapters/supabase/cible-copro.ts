// Viser UNE fiche de public."Copropriete" (App A, le referentiel partage du patron) avant
// d'y ecrire. Deux garde-fous nes de l'audit du 16/09/2026 :
//   - le code passe dans un filtre PostgREST `.or(...)` : un code du type `a,id.gt.0`
//     y injectait une condition et l'UPDATE touchait toutes les lignes ;
//   - un UPDATE filtre par code peut viser 0 ou N fiches : on resout d'abord l'id, on
//     exige exactement une fiche, puis on ecrit par `.eq("id", ...)`.

import type { createSupabasePublicClient } from "./public-client";

const CODE_COPRO_RE = /^[A-Za-z0-9_-]{1,20}$/;

/** Filtre `.or(...)` sur les deux references (Crypto et ESTALE). Refuse tout code illisible. */
export function filtreCodeCopro(coproCode: string): string {
  if (!CODE_COPRO_RE.test(coproCode)) {
    throw new Error(`Code de copropriété illisible : « ${coproCode.slice(0, 40)} ».`);
  }
  return `referenceCrypto.eq.${coproCode},referenceEstale.eq.${coproCode}`;
}

/**
 * L'id de LA fiche qui porte ce code (et, si donne, qui passe le filtre de perimetre).
 * 0 fiche ou plus d'une : erreur explicite, rien n'est ecrit par l'appelant.
 */
export async function idCoproUnique(
  supabase: ReturnType<typeof createSupabasePublicClient>,
  coproCode: string,
  contexte: string,
  filtrePerimetre?: string,
): Promise<string> {
  let q = supabase.from("Copropriete").select("id").or(filtreCodeCopro(coproCode));
  // Les deux .or sont ANDes par PostgREST : (bonne copro) ET (geree | assistee).
  if (filtrePerimetre) q = q.or(filtrePerimetre);
  const { data, error } = await q.limit(2);
  if (error) throw new Error(`${contexte} : ${error.message}`);
  const lignes = (data ?? []) as { id: string }[];
  if (lignes.length === 0) {
    throw new Error(`${contexte} : copropriété ${coproCode} introuvable${filtrePerimetre ? " ou hors du périmètre" : ""}.`);
  }
  if (lignes.length > 1) {
    throw new Error(`${contexte} : plusieurs fiches portent le code ${coproCode}, rien n'a été modifié.`);
  }
  return lignes[0].id;
}

/** Apres un UPDATE `.eq("id", ...).select("id")` : exactement une ligne touchee, sinon erreur. */
export function exigerUneLigne(contexte: string, data: unknown[] | null, error: { message: string } | null): void {
  if (error) throw new Error(`${contexte} : ${error.message}`);
  if (!data || data.length !== 1) throw new Error(`${contexte} : ${data?.length ?? 0} fiche modifiée au lieu d'une.`);
}
