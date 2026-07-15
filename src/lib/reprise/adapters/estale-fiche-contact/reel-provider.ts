// Adapter REEL du port EstaleFicheContactProvider : ecrit l'email d'un owner dans l'eStale
// de PRODUCTION. SEUL fichier de ce flux qui connait estaleGql (hexagonal).
//
// ATTENTION : n'est jamais instancie par defaut. Le routeur (router.ts) ne le choisit que si
// ESTALE_ECRITURE=reel ET identifiants eStale presents. Le DRY-RUN reste le defaut.
//
// Mutation VERIFIEE (docs/estale-schema.graphql) :
//   updateOwner(id: ID!): OwnerMutation! ; OwnerMutation.update(input: OwnerInput!): Owner!
// OwnerInput REMPLACE l'owner (civility/lastname/resident obligatoires). Pour ne RIEN ecraser
// on relit d'abord l'owner courant (tous les champs OwnerInput) et on ne change que l'email.
//
// Resolution : coproCode -> condoID (condos accessibles, multi-agence), puis matching de
// l'owner par nom (+prenom) parmi condo.owners. On NE DEVINE JAMAIS : 0 ou >1 correspondance
// -> erreur explicite (le gestionnaire tranche a la main). UNTESTED contre la prod (l'auteur
// n'a fait aucun appel reel) : gate off par defaut, a eprouver sur une vraie reprise.

import { estaleGql } from "@/lib/adapters/estale/client";
import type {
  EstaleFicheContactProvider,
  MajEmailOwnerInput,
  MajEmailResultat,
} from "@/lib/reprise/ports/estale-fiche-contact-provider";

// --- Resolution copro -> condoID (memes sources que l'adapter compta) -----------
const Q_CONDOS_ACCESSIBLES = `query {
  me {
    collaborator { condos(archived: false) { id reference } }
    agency { condos(archived: false) { id reference } }
    accesses {
      ... on Agency { condos(archived: false) { id reference } }
      ... on Establishment { condos(archived: false) { id reference } }
      ... on Collaborator { condos(archived: false) { id reference } }
    }
  }
}`;

type CondoRef = { id: string; reference: string };
type CondosData = {
  me: {
    collaborator: { condos: CondoRef[] } | null;
    agency: { condos: CondoRef[] } | null;
    accesses: ({ condos?: CondoRef[] } | null)[] | null;
  };
};

// Owner courant (tous les champs OwnerInput pour ne rien ecraser au update).
const Q_CONDO_OWNERS = `query($id: ID!) {
  condo(id: $id) {
    owners(archived: false) {
      id reference civility lastname firstname
      birthDate birthPlace birthCountry
      companyName companyForm companySiret companyCapital
      email phone mobile resident
    }
  }
}`;

interface OwnerCourant {
  id: string;
  reference: string;
  civility: string;
  lastname: string;
  firstname: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthCountry: string | null;
  companyName: string | null;
  companyForm: string | null;
  companySiret: string | null;
  companyCapital: number | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  resident: boolean;
}
type CondoOwnersData = { condo: { owners: OwnerCourant[] } | null };

const M_UPDATE_OWNER = `mutation($id: ID!, $input: OwnerInput!) {
  updateOwner(id: $id) { update(input: $input) { id email } }
}`;

function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
}

/** Normalise un nom pour le matching : majuscules, sans accents, espaces compresses. */
function normNom(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export class ReelEstaleFicheContactProvider implements EstaleFicheContactProvider {
  async mettreAJourEmailOwner(input: MajEmailOwnerInput): Promise<MajEmailResultat> {
    const condoID = await this.resoudreCondoId(input.coproCode);
    if (!condoID) {
      throw new Error(`Copro ${input.coproCode} introuvable via l'API eStale (acces / reference).`);
    }

    const data = await estaleGql<CondoOwnersData>(Q_CONDO_OWNERS, { id: condoID });
    const owners = data.condo?.owners ?? [];

    const cibleNom = normNom(input.nom);
    const ciblePrenom = normNom(input.prenom);
    let candidats = owners.filter((o) => normNom(o.lastname) === cibleNom);
    if (candidats.length > 1 && ciblePrenom) {
      const affine = candidats.filter((o) => normNom(o.firstname) === ciblePrenom);
      if (affine.length > 0) candidats = affine;
    }

    if (candidats.length === 0) {
      throw new Error(`Owner "${input.nom}" introuvable dans la copro ${input.coproCode} (aucune correspondance).`);
    }
    if (candidats.length > 1) {
      throw new Error(
        `Owner "${input.nom}" ambigu dans la copro ${input.coproCode} (${candidats.length} homonymes) : a trancher a la main.`,
      );
    }

    const o = candidats[0];
    // On repousse l'owner INCHANGE + le nouvel email (OwnerInput remplace tout).
    const ownerInput = {
      civility: o.civility,
      lastname: o.lastname,
      resident: o.resident,
      ...(o.firstname ? { firstname: o.firstname } : {}),
      ...(o.birthDate ? { birthDate: o.birthDate } : {}),
      ...(o.birthPlace ? { birthPlace: o.birthPlace } : {}),
      ...(o.birthCountry ? { birthCountry: o.birthCountry } : {}),
      ...(o.companyName ? { companyName: o.companyName } : {}),
      ...(o.companyForm ? { companyForm: o.companyForm } : {}),
      ...(o.companySiret ? { companySiret: o.companySiret } : {}),
      ...(o.companyCapital ? { companyCapital: o.companyCapital } : {}),
      ...(o.phone ? { phone: o.phone } : {}),
      ...(o.mobile ? { mobile: o.mobile } : {}),
      email: input.email,
    };

    await estaleGql(M_UPDATE_OWNER, { id: o.id, input: ownerInput });
    return { applique: true, note: `Email ecrit dans eStale (owner ${o.reference}, copro ${input.coproCode}).` };
  }

  private async resoudreCondoId(code: string): Promise<string | null> {
    const data = await estaleGql<CondosData>(Q_CONDOS_ACCESSIBLES);
    const parId = new Map<string, CondoRef>();
    const ajouter = (liste?: CondoRef[] | null) => {
      for (const c of liste ?? []) if (c && c.id) parId.set(c.id, c);
    };
    ajouter(data.me.collaborator?.condos);
    ajouter(data.me.agency?.condos);
    for (const acces of data.me.accesses ?? []) ajouter(acces?.condos);
    const cible = normaliserRef(code);
    return [...parId.values()].find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
  }
}
