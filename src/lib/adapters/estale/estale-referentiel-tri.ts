// Adapter ESTALE du referentiel du tri des e-mails (ADR-043). LECTURE SEULE.
// Pour chaque copro accessible au compte de service : nom, adresse, equipe, et toutes
// les adresses e-mail qu'ESTALE lui connait : coproprietaires et leurs contacts
// (locataires compris), conseil syndical, mandataires des coproprietaires, notaires des
// ventes en cours, contacts fournisseurs. Une requete par copro, 4 a la fois, comme l'annuaire
// Linkus : l'API coupe a 30 s, une mega-requete tomberait sur la limite quand le parc
// grandira. Cache module de 10 min : mesure du 25/09/2026, ~0,6 s pour 9 copros.

import {
  estAssistantDeCopro,
  type CoproTri,
  type LienExpediteur,
  type QualiteExpediteur,
  type ReferentielTri,
} from "@/lib/domain/tri-emails";
import type { ReferentielTriProvider } from "@/lib/ports/referentiel-tri-provider";
import { estaleGql } from "./client";
import { chargerCondosAccessibles } from "./condos-accessibles";

const Q_COPRO = `query($id: ID!) {
  condo(id: $id) {
    reference name
    address { housenumber street postcode city }
    collaborators { id role fullname email }
    serviceBook { mandate { managerID } }
    owners(archived: false) { email rentalAgent { email } contacts(archived: false) { email tenant } }
    council { owner { email } }
    suppliers(archived: false) { contacts(archived: false) { email } }
    sales(archived: false) { notaryPersonnel { email } notaryOffice { personnels { email } } }
  }
}`;

type Condo = {
  reference: string;
  name: string;
  address: { housenumber: string | null; street: string | null; postcode: string | null; city: string | null } | null;
  collaborators: { id: string; role: string | null; fullname: string; email: string }[] | null;
  serviceBook: { mandate: { managerID: string | null } | null } | null;
  owners:
    | {
        email: string | null;
        rentalAgent: { email: string | null } | null;
        contacts: { email: string | null; tenant: boolean }[] | null;
      }[]
    | null;
  council: { owner: { email: string | null } | null }[] | null;
  suppliers: { contacts: { email: string | null }[] | null }[] | null;
  sales:
    | {
        notaryPersonnel: { email: string | null } | null;
        notaryOffice: { personnels: { email: string | null }[] | null } | null;
      }[]
    | null;
};

const EN_PARALLELE = 4;
const TTL_MS = 10 * 60 * 1000;
// Nos propres adresses (collaborateurs saisis comme contacts) ne designent pas une copro.
const DOMAINE_INTERNE = "@real31.fr";

let cache: { valeur: ReferentielTri; expire: number } | null = null;

function versCopro(c: Condo): CoproTri {
  const equipe = c.collaborators ?? [];
  const managerId = c.serviceBook?.mandate?.managerID ?? null;
  const g = managerId ? equipe.find((x) => x.id === managerId) : undefined;
  const a = equipe.find((x) => x.id !== managerId && estAssistantDeCopro(x.role));
  const ad = c.address;
  const adresse = ad
    ? [[ad.housenumber, ad.street].filter(Boolean).join(" "), [ad.postcode, ad.city].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(" ")
    : "";
  return {
    reference: c.reference,
    nom: c.name,
    adresse,
    gestionnaire: g ? { nomComplet: g.fullname, email: g.email } : null,
    assistant: a ? { nomComplet: a.fullname, email: a.email } : null,
  };
}

function indexer(c: Condo, index: Record<string, LienExpediteur[]>): void {
  const ajouter = (email: string | null | undefined, qualite: QualiteExpediteur) => {
    const cle = (email ?? "").trim().toLowerCase();
    if (!cle.includes("@") || cle.endsWith(DOMAINE_INTERNE)) return;
    const liens = (index[cle] ??= []);
    if (!liens.some((l) => l.reference === c.reference && l.qualite === qualite)) {
      liens.push({ reference: c.reference, qualite });
    }
  };
  // Le conseil syndical d'abord : c'est la qualite la plus parlante dans la raison affichee.
  for (const m of c.council ?? []) ajouter(m.owner?.email, "conseil syndical");
  for (const o of c.owners ?? []) {
    ajouter(o.email, "copropriétaire");
    for (const x of o.contacts ?? []) ajouter(x.email, x.tenant ? "locataire" : "copropriétaire");
    ajouter(o.rentalAgent?.email, "mandataire");
  }
  for (const v of c.sales ?? []) {
    ajouter(v.notaryPersonnel?.email, "notaire");
    for (const p of v.notaryOffice?.personnels ?? []) ajouter(p.email, "notaire");
  }
  for (const s of c.suppliers ?? []) for (const x of s.contacts ?? []) ajouter(x.email, "fournisseur");
}

export class EstaleReferentielTri implements ReferentielTriProvider {
  async charger(): Promise<ReferentielTri> {
    if (cache && Date.now() < cache.expire) return cache.valeur;
    const refs = await chargerCondosAccessibles();
    const copros: CoproTri[] = [];
    const expediteurs: Record<string, LienExpediteur[]> = {};
    for (let i = 0; i < refs.length; i += EN_PARALLELE) {
      const lot = refs.slice(i, i + EN_PARALLELE);
      const donnees = await Promise.all(lot.map((r) => estaleGql<{ condo: Condo | null }>(Q_COPRO, { id: r.id })));
      for (const d of donnees) {
        if (!d.condo) continue;
        copros.push(versCopro(d.condo));
        indexer(d.condo, expediteurs);
      }
    }
    copros.sort((a, b) => a.reference.localeCompare(b.reference));
    const valeur = { copros, expediteurs };
    cache = { valeur, expire: Date.now() + TTL_MS };
    return valeur;
  }
}
