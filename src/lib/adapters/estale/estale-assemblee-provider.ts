// Adapter Estale de l'AG (palier 1, LECTURE SEULE). Resout la copro par reference
// normalisee (S0299 -> S299) via me.collaborator.condos, puis lit les motions de
// l'AG ORDINARY pertinente (non close en priorite). Cf. ADR-024.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg, MotionAg, OrdreMotion, ResolutionLibre } from "@/lib/domain/assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import { rangParent } from "@/lib/domain/resolution";
import { estaleGql } from "./client";
import { resoudreCondoId } from "./condos-accessibles";

// createMotion attend un `type` (chaine Estale) : "generic" = resolution normale,
// "group" = en-tete de groupe. La majorite est l'enum MeetingMotionMajority.
type MotionInput = {
  type: string;
  title: string;
  body: string;
  majority: MajoriteResolution;
  preamble?: string | null;
  postamble?: string | null;
  comment?: string | null;
};
type BankFull = {
  id: string;
  type: string;
  rank: string;
  title: string;
  body: string | null;
  majority: string;
  preamble: string | null;
  postamble: string | null;
  comment: string | null;
};

// --- Resolution reference -> condo id (helper partage) ----------------------
// Meme approche que EstaleCondoProvider : la liste complete des condos accessibles
// etait refetchee a CHAQUE appel (getAssemblee, creerAssemblee, appliquerOdj en
// refaisaient chacun une) alors qu'elle ne bouge pas a l'echelle de la minute.
// Resolution deleguee au helper PARTAGE (union collaborator + agency + accesses,
// cf. condos-accessibles.ts) : `me.collaborator.condos` seul ne resolvait que les
// copros dont le compte de service est gestionnaire attitre (2 sur 8 le 2026-07-28)
// -> l'ODJ / le composer d'une AG d'une AUTRE copro eStale ne trouvait aucune AG.
async function resoudreCondoIdCache(coproCode: string): Promise<string | null> {
  return resoudreCondoId(coproCode);
}

const MAJORITES = new Set<MajoriteResolution>([
  "A24", "A25", "A25_1", "A26", "A26_1", "UNANIMITY", "QUESTION",
]);
function majorite(v: string): MajoriteResolution {
  return MAJORITES.has(v as MajoriteResolution) ? (v as MajoriteResolution) : "QUESTION";
}

type MotionRow = {
  id: string;
  rank: string;
  type: string;
  title: string;
  majority: string;
  dk: { name: string } | null;
  parent: { id: string } | null;
};
type MeetingRow = {
  id: string;
  name: string;
  category: string;
  startAt: string | null;
  isClosed: boolean;
  motions: MotionRow[];
};

export class EstaleAssembleeProvider implements AssembleeEstaleProvider {
  async getAssemblee(coproCode: string): Promise<AssembleeAg | null> {
    const condoId = await resoudreCondoIdCache(coproCode);
    if (!condoId) return null;

    const data = await estaleGql<{ condo: { meetings: MeetingRow[] } }>(
      `query AgCopro($id: ID!) {
        condo(id: $id) {
          meetings {
            id name category startAt isClosed
            motions { id rank type title majority dk { name } parent { id } }
          }
        }
      }`,
      { id: condoId },
    );

    const ordinary = data.condo.meetings.filter((m) => m.category === "ORDINARY");
    if (ordinary.length === 0) return null;
    const ouvertes = ordinary.filter((m) => !m.isClosed);
    const choisie =
      ouvertes[0] ??
      [...ordinary].sort((a, b) => (b.startAt ?? "").localeCompare(a.startAt ?? ""))[0];

    const motions: MotionAg[] = [...choisie.motions]
      .sort((a, b) => a.rank.localeCompare(b.rank))
      .map((m) => ({
        id: m.id,
        titre: m.title,
        majorite: majorite(m.majority),
        ...(m.dk?.name ? { cleRepartition: m.dk.name } : {}),
        ...(m.type === "group" ? { estGroupe: true } : {}),
        ...(m.parent ? { estEnfant: true, parentId: m.parent.id } : {}),
      }));

    return {
      meetingId: choisie.id,
      nom: choisie.name,
      ...(choisie.startAt ? { dateISO: choisie.startAt.slice(0, 10) } : {}),
      cloturee: choisie.isClosed,
      motions,
    };
  }

  async creerAssemblee(coproCode: string): Promise<string> {
    const moi = await estaleGql<{ me: { collaborator: { id: string } } }>(
      `{ me { collaborator { id } } }`,
    );
    const collabId = moi.me.collaborator.id;
    const condoId = await resoudreCondoIdCache(coproCode);
    if (!condoId) throw new Error(`Copropriété ${coproCode} introuvable dans Estale.`);

    const data = await estaleGql<{
      condo: {
        dks: { id: string; isDefault: boolean }[];
        accountingV2: {
          periodCurrent: [string, string] | null;
          exercices: { id: string; period: [string, string] }[];
        };
      };
    }>(
      `query Pieces($id: ID!) {
        condo(id: $id) {
          dks { id isDefault }
          accountingV2 { periodCurrent exercices { id period } }
        }
      }`,
      { id: condoId },
    );

    const dkId = (data.condo.dks.find((k) => k.isDefault) ?? data.condo.dks[0])?.id;
    const acc = data.condo.accountingV2;
    // Exercice courant (periodCurrent) en priorite, sinon le plus recent.
    const debutCourant = acc.periodCurrent?.[0];
    const exercice =
      acc.exercices.find((e) => e.period?.[0] === debutCourant) ??
      [...acc.exercices].sort((a, b) => (b.period?.[0] ?? "").localeCompare(a.period?.[0] ?? ""))[0];
    if (!dkId || !exercice) {
      throw new Error("Exercice ou clé de répartition introuvable pour cette copropriété.");
    }

    const annee = exercice.period?.[0]?.slice(0, 4) ?? "";
    const res = await estaleGql<{ createMeeting: { id: string } }>(
      `mutation CreerAg($input: MeetingCreateInput!) { createMeeting(input: $input) { id } }`,
      {
        input: {
          condoID: condoId,
          accountingID: exercice.id,
          dkID: dkId,
          name: `Assemblée Générale Ordinaire${annee ? ` ${annee}` : ""}`,
          category: "ORDINARY",
          participantsIDs: [collabId],
        },
      },
    );
    return res.createMeeting.id;
  }

  /**
   * IDEMPOTENT par reconciliation (audit API 2026-07-16, P0-4). Probleme d'origine : la
   * sequence N suppressions + M creations + 1 reordonnancement n'est pas atomique ; un 502
   * au milieu laissait l'AG a moitie modifiee, et un re-clic du gestionnaire DUPLIQUAIT les
   * motions deja creees. Desormais on RELIT l'etat reel de l'AG en tete et on ne joue que
   * le DELTA :
   *   - une suppression dont l'id a deja disparu est sautee (deja faite) ;
   *   - une motion a creer dont un ORPHELIN de meme type + meme titre existe deja dans l'AG
   *     (motion inconnue de la composition envoyee par l'UI = laissee par une application
   *     precedente interrompue) est ADOPTEE au lieu d'etre recreee -> comptee `dejaPresentes` ;
   *   - le reordonnancement final replace TOUT (existant + adopte + cree).
   * Rejouer 2x la meme application = meme etat final, zero doublon.
   */
  async appliquerOdj(
    coproCode: string,
    meetingId: string,
    supprimerMotionIds: string[],
    bankItemIds: string[],
    libres: ResolutionLibre[],
    ordreTopExistant: string[],
  ): Promise<{ supprimees: number; ajoutees: number; dejaPresentes: number }> {
    // 0. Etat REEL de l'AG avant toute mutation. Sans lui, pas de reconciliation possible :
    // on refuse d'appliquer en aveugle (risque de doublon) plutot que de degrader.
    const condoId = await this.resoudreCondoId(coproCode);
    if (!condoId) {
      throw new Error(
        `Copropriété ${coproCode} introuvable dans Estale : impossible de vérifier l'état de l'AG avant d'appliquer l'ODJ.`,
      );
    }
    type Cour = { id: string; rank: string; type: string; title: string; parent: { id: string } | null };
    const courant: Cour[] = (
      await estaleGql<{ condo: { meeting: { motions: Cour[] } } }>(
        `query MotionsAg($cid: ID!, $mid: ID!) {
          condo(id: $cid) { meeting(id: $mid) { motions { id rank type title parent { id } } } }
        }`,
        { cid: condoId, mid: meetingId },
      )
    ).condo.meeting.motions;

    const presentsAvant = new Set(courant.map((m) => m.id));
    // Motions CONNUES de la composition envoyee par l'UI : les tetes listees (ordreTopExistant),
    // les ids marques pour suppression, et les enfants de ces motions connues. Tout le reste est
    // ORPHELIN : inconnu de l'UI, donc laisse par une application precedente interrompue (ou un
    // ajout concurrent cote eStale) -> candidat a l'ADOPTION par titre.
    const idsConnus = new Set([...ordreTopExistant, ...supprimerMotionIds]);
    const cleMotion = (type: string, titre: string): string =>
      `${type === "group" ? "g" : "m"}|${titre.trim().replace(/\s+/g, " ").toLowerCase()}`;
    const orphelinsParCle = new Map<string, string[]>();
    for (const m of courant) {
      if (idsConnus.has(m.id)) continue;
      if (m.parent && idsConnus.has(m.parent.id)) continue; // enfant existant d'une motion connue
      const k = cleMotion(m.type, m.title);
      (orphelinsParCle.get(k) ?? orphelinsParCle.set(k, []).get(k)!).push(m.id);
    }

    let supprimees = 0;
    let ajoutees = 0;
    let dejaPresentes = 0;

    // Adopte un orphelin equivalent (multiset : chaque orphelin n'est adopte qu'une fois),
    // sinon cree la motion. C'est LA brique qui rend la relance sans doublon.
    const obtenirOuCreer = async (input: MotionInput): Promise<string> => {
      const k = cleMotion(input.type, input.title);
      const dispo = orphelinsParCle.get(k);
      if (dispo && dispo.length > 0) {
        dejaPresentes++;
        return dispo.shift()!;
      }
      const id = await this.creerMotion(meetingId, input);
      ajoutees++;
      return id;
    };

    const nouveauxTops: { id: string; enfants: string[] }[] = [];
    try {
      // 1. Suppressions des motions retirees - en sautant celles deja disparues (relance).
      for (const motionId of supprimerMotionIds) {
        if (!presentsAvant.has(motionId)) continue; // deja supprimee par une application precedente
        await estaleGql(
          `mutation Suppr($mid: ID!, $id: ID!) {
            updateMeeting(id: $mid) { updateMotion(id: $id) { delete { id } } }
          }`,
          { mid: meetingId, id: motionId },
        );
        supprimees++;
      }

      // 2. Creation (ou adoption) des motions voulues, a plat ; le nesting se fera par
      // orderMotions. On recupere le contenu COMPLET de la bank (texte legal, preambule...)
      // et on garde la structure des groupes (en-tete + sous-resolutions).
      if (bankItemIds.length > 0) {
        const data = await estaleGql<{
          me: { collaborator: { establishment: { motionsBank: BankFull[] } } };
        }>(
          `{ me { collaborator { establishment { motionsBank {
            id type rank title body majority preamble postamble comment
          } } } } }`,
        );
        const parId = new Map(data.me.collaborator.establishment.motionsBank.map((m) => [m.id, m]));
        const selection = bankItemIds.map((id) => parId.get(id)).filter((it): it is BankFull => !!it);
        const input = (it: BankFull): MotionInput => ({
          type: it.type === "group" ? "group" : "generic",
          title: it.title,
          body: it.body || it.title,
          majority: majorite(it.majority),
          preamble: it.preamble,
          postamble: it.postamble,
          comment: it.comment,
        });
        const groupes = selection.filter((it) => it.type === "group");
        const rangsGroupes = new Set(groupes.map((g) => g.rank));
        const estEnfantSelectionne = (it: BankFull) =>
          it.type !== "group" && rangParent(it.rank) !== null && rangsGroupes.has(rangParent(it.rank)!);

        // Groupes : en-tete + sous-resolutions.
        for (const g of groupes) {
          const gid = await obtenirOuCreer(input(g));
          const enfants = selection
            .filter((it) => rangParent(it.rank) === g.rank && it.type !== "group")
            .sort((a, b) => a.rank.localeCompare(b.rank));
          const cids: string[] = [];
          for (const e of enfants) {
            cids.push(await obtenirOuCreer(input(e)));
          }
          nouveauxTops.push({ id: gid, enfants: cids });
        }
        // Resolutions autonomes (ni groupe, ni enfant d'un groupe selectionne).
        for (const it of selection) {
          if (it.type === "group" || estEnfantSelectionne(it)) continue;
          const sid = await obtenirOuCreer(input(it));
          nouveauxTops.push({ id: sid, enfants: [] });
        }
      }
      // Resolutions libres saisies par le gestionnaire.
      for (const l of libres) {
        const lid = await obtenirOuCreer({
          type: "generic",
          title: l.titre,
          body: l.corps || l.titre,
          majority: l.majorite,
        });
        nouveauxTops.push({ id: lid, enfants: [] });
      }

      // 3. Reconciliation de l'ordre a partir de l'etat lu en tete : les tetes existantes dans
      // l'ordre voulu (avec leurs enfants existants), puis les motions voulues (adoptees ou
      // creees), puis le RELIQUAT (orphelins non adoptes, ex. ajout concurrent cote eStale) -
      // orderMotions exige l'ENSEMBLE des motions. Rangs hierarchiques "N" + "N.j".
      const supprimesEffectifs = new Set(supprimerMotionIds.filter((id) => presentsAvant.has(id)));
      const nouveauxIds = new Set(nouveauxTops.flatMap((t) => [t.id, ...t.enfants]));
      const enfantsExistantsDe = new Map<string, Cour[]>();
      for (const m of courant) {
        if (m.parent && !supprimesEffectifs.has(m.id) && !nouveauxIds.has(m.id)) {
          (enfantsExistantsDe.get(m.parent.id) ?? enfantsExistantsDe.set(m.parent.id, []).get(m.parent.id)!).push(m);
        }
      }

      const topsExistants = ordreTopExistant
        .filter((id) => presentsAvant.has(id) && !supprimesEffectifs.has(id) && !nouveauxIds.has(id))
        .map((id) => ({
          id,
          enfants: (enfantsExistantsDe.get(id) ?? [])
            .sort((a, b) => a.rank.localeCompare(b.rank))
            .map((c) => c.id),
        }));
      const finalTops = [...topsExistants, ...nouveauxTops];

      // Reliquat : motions encore presentes mais ni connues, ni adoptees, ni creees. On les
      // rattache a leur parent s'il figure dans finalTops, sinon en tete de liste (fin).
      const places = new Set(finalTops.flatMap((t) => [t.id, ...t.enfants]));
      const reliquat = courant
        .filter((m) => !supprimesEffectifs.has(m.id) && !places.has(m.id))
        .sort((a, b) => a.rank.localeCompare(b.rank));
      const topParId = new Map(finalTops.map((t) => [t.id, t]));
      const reliquatTops: Cour[] = [];
      for (const m of reliquat) {
        const parent = m.parent ? topParId.get(m.parent.id) : undefined;
        if (parent) parent.enfants.push(m.id);
        else reliquatTops.push(m);
      }
      for (const m of reliquatTops) {
        const enfants = reliquat
          .filter((c) => c.parent?.id === m.id)
          .map((c) => c.id);
        const top = { id: m.id, enfants };
        topParId.set(m.id, top);
        finalTops.push(top);
      }
      // Derniere passe : un reliquat dont le parent vient d'etre appendu (2 niveaux max cote
      // eStale, donc ce cas est deja couvert ci-dessus) ou orphelin de parent supprime -> tete.
      const placesFinal = new Set(finalTops.flatMap((t) => [t.id, ...t.enfants]));
      for (const m of reliquat) {
        if (!placesFinal.has(m.id)) finalTops.push({ id: m.id, enfants: [] });
      }

      const ordreInput: OrdreMotion[] = [];
      finalTops.forEach((t, i) => {
        ordreInput.push({ motionID: t.id, rank: String(i + 1) });
        t.enfants.forEach((cid, j) => ordreInput.push({ motionID: cid, rank: `${i + 1}.${j + 1}` }));
      });
      if (ordreInput.length > 0) {
        await estaleGql(
          `mutation Ordonner($mid: ID!, $in: [MeetingMotionOrderInput!]!) {
            updateMeeting(id: $mid) { orderMotions(input: $in) { id } }
          }`,
          { mid: meetingId, in: ordreInput },
        );
      }
    } catch (e) {
      // Echec PARTIEL : on dit clairement ou on en est et que la relance est SANS RISQUE
      // (la reconciliation ci-dessus saute/adopte ce qui est deja applique).
      throw new Error(
        `Application de l'ODJ interrompue (${supprimees} retrait(s) et ${ajoutees} ajout(s) déjà appliqués) : ` +
          `${e instanceof Error ? e.message : String(e)} ` +
          `Relance l'enregistrement pour compléter : rien ne sera dupliqué.`,
      );
    }

    return { supprimees, ajoutees, dejaPresentes };
  }

  private async resoudreCondoId(coproCode: string): Promise<string | null> {
    return resoudreCondoIdCache(coproCode);
  }

  private async creerMotion(
    meetingId: string,
    input: MotionInput,
    parentID?: string,
  ): Promise<string> {
    const d = await estaleGql<{ updateMeeting: { createMotion: { id: string } } }>(
      `mutation AjoutMotion($id: ID!, $input: MeetingMotionCreateInput!, $parentID: ID) {
        updateMeeting(id: $id) { createMotion(input: $input, parentID: $parentID) { id } }
      }`,
      { id: meetingId, input, parentID: parentID ?? null },
    );
    return d.updateMeeting.createMotion.id;
  }
}
