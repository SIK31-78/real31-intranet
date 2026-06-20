// Adapter Estale de l'AG (palier 1, LECTURE SEULE). Resout la copro par reference
// normalisee (S0299 -> S299) via me.collaborator.condos, puis lit les motions de
// l'AG ORDINARY pertinente (non close en priorite). Cf. ADR-024.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg, MotionAg, OrdreMotion, ResolutionLibre } from "@/lib/domain/assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import { rangParent } from "@/lib/domain/resolution";
import { estaleGql } from "./client";

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

function normaliserRef(ref: string): string {
  const m = ref.trim().toUpperCase().match(/^([A-Z]+)0*(\d+)$/);
  return m ? `${m[1]}${m[2]}` : ref.trim().toUpperCase();
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
    const condos = await estaleGql<{ me: { collaborator: { condos: { id: string; reference: string }[] } } }>(
      `{ me { collaborator { condos(archived: false) { id reference } } } }`,
    );
    const cible = normaliserRef(coproCode);
    const condoId = condos.me.collaborator.condos.find((c) => normaliserRef(c.reference) === cible)?.id;
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
    const moi = await estaleGql<{
      me: { collaborator: { id: string; condos: { id: string; reference: string }[] } };
    }>(`{ me { collaborator { id condos(archived: false) { id reference } } } }`);
    const collabId = moi.me.collaborator.id;
    const cible = normaliserRef(coproCode);
    const condoId = moi.me.collaborator.condos.find((c) => normaliserRef(c.reference) === cible)?.id;
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

  async appliquerOdj(
    coproCode: string,
    meetingId: string,
    supprimerMotionIds: string[],
    bankItemIds: string[],
    libres: ResolutionLibre[],
    ordreTopExistant: string[],
  ): Promise<{ supprimees: number; ajoutees: number }> {
    let supprimees = 0;
    let ajoutees = 0;

    // 1. Suppressions des motions retirees.
    for (const motionId of supprimerMotionIds) {
      await estaleGql(
        `mutation Suppr($mid: ID!, $id: ID!) {
          updateMeeting(id: $mid) { updateMotion(id: $id) { delete { id } } }
        }`,
        { mid: meetingId, id: motionId },
      );
      supprimees++;
    }

    // 2. Creation des nouvelles motions (a plat ; le nesting se fera par orderMotions).
    // On recupere le contenu COMPLET de la bank (texte legal, preambule...) et on garde
    // la structure des groupes (en-tete + sous-resolutions) pour les ranger ensuite.
    const nouveauxTops: { id: string; enfants: string[] }[] = [];
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
        const gid = await this.creerMotion(meetingId, input(g));
        ajoutees++;
        const enfants = selection
          .filter((it) => rangParent(it.rank) === g.rank && it.type !== "group")
          .sort((a, b) => a.rank.localeCompare(b.rank));
        const cids: string[] = [];
        for (const e of enfants) {
          cids.push(await this.creerMotion(meetingId, input(e)));
          ajoutees++;
        }
        nouveauxTops.push({ id: gid, enfants: cids });
      }
      // Resolutions autonomes (ni groupe, ni enfant d'un groupe selectionne).
      for (const it of selection) {
        if (it.type === "group" || estEnfantSelectionne(it)) continue;
        const sid = await this.creerMotion(meetingId, input(it));
        ajoutees++;
        nouveauxTops.push({ id: sid, enfants: [] });
      }
    }
    // Resolutions libres saisies par le gestionnaire.
    for (const l of libres) {
      const lid = await this.creerMotion(meetingId, {
        type: "generic",
        title: l.titre,
        body: l.corps || l.titre,
        majority: l.majorite,
      });
      ajoutees++;
      nouveauxTops.push({ id: lid, enfants: [] });
    }

    // 3. Reconciliation de l'ordre. On relit l'AG (enfants des groupes EXISTANTS), on place
    // l'existant (ordre voulu) puis les nouvelles motions, et on assigne des rangs
    // hierarchiques ("1","2".. + "N.j"). orderMotions exige l'ENSEMBLE des motions.
    const condoId = await this.resoudreCondoId(coproCode);
    type Cour = { id: string; rank: string; parent: { id: string } | null };
    const courant: Cour[] = condoId
      ? (
          await estaleGql<{ condo: { meeting: { motions: Cour[] } } }>(
            `query MotionsAg($cid: ID!, $mid: ID!) {
              condo(id: $cid) { meeting(id: $mid) { motions { id rank parent { id } } } }
            }`,
            { cid: condoId, mid: meetingId },
          )
        ).condo.meeting.motions
      : [];
    const presents = new Set(courant.map((m) => m.id));
    const nouveauxIds = new Set(nouveauxTops.flatMap((t) => [t.id, ...t.enfants]));
    const enfantsExistantsDe = new Map<string, Cour[]>();
    for (const m of courant) {
      if (m.parent && !nouveauxIds.has(m.id)) {
        (enfantsExistantsDe.get(m.parent.id) ?? enfantsExistantsDe.set(m.parent.id, []).get(m.parent.id)!).push(m);
      }
    }

    const topsExistants = ordreTopExistant
      .filter((id) => presents.has(id) && !nouveauxIds.has(id))
      .map((id) => ({
        id,
        enfants: (enfantsExistantsDe.get(id) ?? [])
          .sort((a, b) => a.rank.localeCompare(b.rank))
          .map((c) => c.id),
      }));
    const finalTops = [...topsExistants, ...nouveauxTops];

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

    return { supprimees, ajoutees };
  }

  private async resoudreCondoId(coproCode: string): Promise<string | null> {
    const condos = await estaleGql<{ me: { collaborator: { condos: { id: string; reference: string }[] } } }>(
      `{ me { collaborator { condos(archived: false) { id reference } } } }`,
    );
    const cible = normaliserRef(coproCode);
    return condos.me.collaborator.condos.find((c) => normaliserRef(c.reference) === cible)?.id ?? null;
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
