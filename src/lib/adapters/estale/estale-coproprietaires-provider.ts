// Adapter ESTALE des copropriétaires joignables par e-mail (REA-356, 19/10/2026). LECTURE
// SEULE : une requête condo(id) { owners(archived: false) }, la même que le mailing ESTALE
// (estale-mailing-provider.ts), avec le nom en plus. Cache module 10 min : le compositeur
// recharge les contacts à chaque copro choisie.

import type { CoproprietaireJoignable, CoproprietairesEstaleProvider } from "@/lib/ports/coproprietaires-estale-provider";
import { estaleGql } from "./client";
import { normaliserRef, resoudreCondoId } from "./condos-accessibles";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { valeur: CoproprietaireJoignable[] | null; expire: number }>();

type OwnerRow = { id: string; fullname: string | null; email: string | null; canReceiveMail: boolean };

export class EstaleCoproprietairesProvider implements CoproprietairesEstaleProvider {
  async listerJoignables(reference: string): Promise<CoproprietaireJoignable[] | null> {
    const ref = normaliserRef(reference);
    const enCache = cache.get(ref);
    if (enCache && Date.now() < enCache.expire) return enCache.valeur;

    const condoId = await resoudreCondoId(ref);
    let valeur: CoproprietaireJoignable[] | null = null;
    if (condoId) {
      const { condo } = await estaleGql<{ condo: { owners: OwnerRow[] } | null }>(
        `query CoproprietairesJoignables($id: ID!) {
          condo(id: $id) { owners(archived: false) { id fullname email canReceiveMail } }
        }`,
        { id: condoId },
      );
      valeur = (condo?.owners ?? [])
        .filter((o) => o.canReceiveMail && (o.email ?? "").trim() !== "")
        .map((o) => ({ id: o.id, nom: (o.fullname ?? "").trim(), email: o.email!.trim() }));
    }
    cache.set(ref, { valeur, expire: Date.now() + TTL_MS });
    return valeur;
  }
}
