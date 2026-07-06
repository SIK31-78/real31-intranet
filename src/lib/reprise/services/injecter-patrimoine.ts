// Service d'INJECTION du patrimoine d'une reprise vers eStale, PAR ID CAPTURE.
// Voie "la plus automatisee" (option 2 granulaire de la proposition) : on enchaine
// create -> capture ID -> relie par ID interne, SANS xlsx et SANS codes 4-caracteres.
//
// Le service parle UNIQUEMENT au port EstaleEcritureProvider (hexagonal) : il ignore si
// derriere c'est un dry-run ou un vrai client GraphQL. Le mapping domaine -> input est
// delegue au util pur mapping-estale.ts.
//
// Ordre eStale strict : lots -> cles -> tantiemes -> owners -> links.
// A chaque etape on capture les IDs eStale renvoyes dans des Map, pour cabler la suivante :
//   - num_lot   -> lotID
//   - code_cle  -> dkID
//   - owner.id  -> ownerID
//
// En cas d'echec, on n'execute PAS le rollback (dry-run), mais on renvoie la liste ordonnee
// (inverse) des IDs crees a defaire, avec l'operation .delete() correspondante -> point
// d'accroche pret pour l'implementation reelle.

import type { JeuDeDonnees } from "@/lib/reprise/domain/patrimoine";
import type { AddressInputEstale, EstaleEcritureProvider } from "@/lib/reprise/ports/estale-ecriture-provider";
import {
  mapLot,
  mapCle,
  mapOwner,
  construireLiensLot,
  type AvertissementMapping,
} from "@/lib/reprise/services/mapping-estale";

/** Type d'entite eStale creee, pour le rollback (choix de l'objet-mutation .delete()). */
export type TypeEntiteEstale = "lot" | "cle" | "owner";

/** Une operation d'ecriture consignee dans le PLAN (ordre = ordre d'appel eStale). */
export interface OperationInjection {
  /** Numero d'ordre global (1-based) dans le plan. */
  seq: number;
  /** La mutation eStale appelee. */
  mutation: "createLot" | "createDK" | "upsertLot" | "createOwner" | "upsertOwner";
  /** Cle domaine concernee (num de lot, code de cle, id owner...) pour lisibilite. */
  cibleDomaine: string;
  /** ID/reference eStale capture(s) apres l'appel (undefined pour les upsert sans retour). */
  resultat?: { id?: string; reference?: string; code?: string };
}

/** Une entite creee dont on garde l'ID pour un eventuel rollback. */
export interface EntiteCreee {
  type: TypeEntiteEstale;
  id: string;
  cibleDomaine: string;
}

export interface RapportInjection {
  condoID: string;
  /** Le plan complet, dans l'ordre d'appel. */
  operations: OperationInjection[];
  compteurs: {
    lots: number;
    cles: number;
    tantiemes: number;
    owners: number;
    links: number;
  };
  /** IDs captures, pour verification/cablage aval. */
  ids: {
    lotParNum: Record<string, string>;
    cleParCode: Record<string, string>;
    ownerParId: Record<string, string>;
  };
  /** Avertissements de mapping (repli applique, a valider par un humain). */
  avertissements: AvertissementMapping[];
  /**
   * Point d'accroche rollback : entites creees dans l'ordre inverse a defaire si echec.
   * En succes complet, c'est la liste de tout ce qui a ete cree (informatif).
   */
  rollback: EntiteCreee[];
  /** Renseigne uniquement si l'injection s'est arretee sur une erreur. */
  erreur?: { operation: string; cibleDomaine: string; message: string };
  /** true si toutes les etapes ont ete deroulees sans erreur. */
  succes: boolean;
}

/**
 * Deroule l'injection du JeuDeDonnees vers eStale via le port fourni.
 * En dry-run l'ordre + les compteurs + les IDs captures forment le PLAN complet.
 *
 * Ne LEVE PAS en cas d'echec d'une operation : capture l'erreur dans le rapport et
 * s'arrete (les IDs deja crees sont dans `rollback`, ordre inverse, prets a defaire).
 */
export async function injecterPatrimoine(
  provider: EstaleEcritureProvider,
  condoID: string,
  jeu: JeuDeDonnees,
  adresseCopro?: AddressInputEstale,
  dkDefautID?: string,
): Promise<RapportInjection> {
  const operations: OperationInjection[] = [];
  const avertissements: AvertissementMapping[] = [];
  const rollback: EntiteCreee[] = [];

  const lotParNum = new Map<string, string>();
  const cleParCode = new Map<string, string>();
  const ownerParId = new Map<string, string>();

  const compteurs = { lots: 0, cles: 0, tantiemes: 0, owners: 0, links: 0 };
  let seq = 0;
  // Operation sur le point d'etre tentee : mise a jour AVANT chaque appel reseau, pour que
  // le catch pointe la vraie operation fautive (et non la derniere reussie, qui induisait
  // en erreur : un echec sur la 1re cle etait ainsi attribue au dernier lot cree).
  let enCours: { mutation: OperationInjection["mutation"]; cibleDomaine: string } | undefined;

  const rapport = (succes: boolean, erreur?: RapportInjection["erreur"]): RapportInjection => ({
    condoID,
    operations,
    compteurs,
    ids: {
      lotParNum: Object.fromEntries(lotParNum),
      cleParCode: Object.fromEntries(cleParCode),
      ownerParId: Object.fromEntries(ownerParId),
    },
    avertissements,
    rollback: [...rollback].reverse(),
    ...(erreur ? { erreur } : {}),
    succes,
  });

  try {
    // 1) LOTS -----------------------------------------------------------------
    for (const lot of jeu.lots) {
      const input = mapLot(lot, avertissements);
      enCours = { mutation: "createLot", cibleDomaine: `lot ${lot.numero}` };
      const { id, reference } = await provider.creerLot(condoID, input);
      lotParNum.set(String(lot.numero), id);
      rollback.push({ type: "lot", id, cibleDomaine: `lot ${lot.numero}` });
      operations.push({
        seq: ++seq,
        mutation: "createLot",
        cibleDomaine: `lot ${lot.numero}`,
        resultat: { id, reference },
      });
      compteurs.lots++;
    }

    // 2) CLES -----------------------------------------------------------------
    // La cle "defaut" (charges generales) est creee AUTOMATIQUEMENT par eStale a la
    // creation de la copro (mainDKID) : on la REUTILISE au lieu de la recreer, sinon
    // conflit cote eStale (createDK plante avec un message generique). Repli sur le code
    // "001" (convention cabinet REAL31 = charges generales, verifiee sur tous les runs) si
    // le flag "defaut" n'est pas present dans le jeu (ex. jeu extrait avant l'ajout du flag
    // au prompt, deja persiste) : evite de dependre d'une re-analyse pour ce cas.
    for (const cle of jeu.cles) {
      const estDefaut = cle.defaut === true || cle.code === "001";
      if (estDefaut && dkDefautID) {
        cleParCode.set(cle.code, dkDefautID);
        operations.push({
          seq: ++seq,
          mutation: "createDK",
          cibleDomaine: `cle ${cle.code} (par defaut, reutilise la cle Charges generales creee par eStale)`,
          resultat: { id: dkDefautID, code: cle.code },
        });
        compteurs.cles++;
        continue;
      }
      const input = mapCle(cle, avertissements);
      enCours = { mutation: "createDK", cibleDomaine: `cle ${cle.code}` };
      const { id, code } = await provider.creerCle(condoID, input);
      cleParCode.set(cle.code, id);
      rollback.push({ type: "cle", id, cibleDomaine: `cle ${cle.code}` });
      operations.push({
        seq: ++seq,
        mutation: "createDK",
        cibleDomaine: `cle ${cle.code}`,
        resultat: { id, code },
      });
      compteurs.cles++;
    }

    // 3) TANTIEMES (granulaires, par (cle, lot)) ------------------------------
    for (const tant of jeu.tantiemes) {
      const dkID = cleParCode.get(tant.cleCode);
      const lotID = lotParNum.get(String(tant.lot));
      if (!dkID) throw new Error(`tantieme : cle "${tant.cleCode}" non capturee (dkID introuvable).`);
      if (!lotID) throw new Error(`tantieme : lot "${tant.lot}" non capture (lotID introuvable).`);
      enCours = { mutation: "upsertLot", cibleDomaine: `cle ${tant.cleCode} / lot ${tant.lot} = ${tant.valeur}` };
      await provider.poserTantieme(dkID, lotID, tant.valeur);
      operations.push({
        seq: ++seq,
        mutation: "upsertLot",
        cibleDomaine: `cle ${tant.cleCode} / lot ${tant.lot} = ${tant.valeur}`,
      });
      compteurs.tantiemes++;
    }

    // 4) OWNERS ---------------------------------------------------------------
    for (const owner of jeu.owners) {
      const { owner: ownerInput, address } = mapOwner(owner, avertissements, adresseCopro);
      enCours = { mutation: "createOwner", cibleDomaine: `owner ${owner.id}` };
      const { id, reference } = await provider.creerOwner(condoID, ownerInput, address);
      ownerParId.set(owner.id, id);
      rollback.push({ type: "owner", id, cibleDomaine: `owner ${owner.id}` });
      operations.push({
        seq: ++seq,
        mutation: "createOwner",
        cibleDomaine: `owner ${owner.id}`,
        resultat: { id, reference },
      });
      compteurs.owners++;
    }

    // 5) LINKS (lot <-> owners), un upsertOwner par lot attribue ---------------
    const attributionsParLot = new Map<number, typeof jeu.attributions>();
    for (const attr of jeu.attributions) {
      const liste = attributionsParLot.get(attr.lot) ?? [];
      liste.push(attr);
      attributionsParLot.set(attr.lot, liste);
    }
    for (const [numLot, attrs] of attributionsParLot) {
      const lotID = lotParNum.get(String(numLot));
      if (!lotID) throw new Error(`link : lot "${numLot}" non capture (lotID introuvable).`);
      const data = construireLiensLot(attrs, ownerParId, avertissements);
      enCours = { mutation: "upsertOwner", cibleDomaine: `lot ${numLot} <- ${data.length} owner(s)` };
      await provider.relierOwnerAuLot(lotID, data);
      operations.push({
        seq: ++seq,
        mutation: "upsertOwner",
        cibleDomaine: `lot ${numLot} <- ${data.length} owner(s)`,
      });
      compteurs.links += data.length;
    }

    return rapport(true);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return rapport(false, {
      operation: enCours?.mutation ?? "(avant 1re operation)",
      cibleDomaine: enCours?.cibleDomaine ?? "-",
      message,
    });
  }
}
