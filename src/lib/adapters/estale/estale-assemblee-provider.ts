// Adapter eStale de l'AG (palier 1, LECTURE SEULE). Resout la copro par reference
// normalisee (S0299 -> S299) via me.collaborator.condos, puis lit les motions de
// l'AG ORDINARY pertinente (non close en priorite). Cf. ADR-024.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg, MotionAg, ResolutionLibre } from "@/lib/domain/assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import { estaleGql } from "./client";

// createMotion attend un `type` (chaine eStale) : "generic" = resolution normale,
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
        ...(m.parent ? { estEnfant: true } : {}),
      }));

    return {
      meetingId: choisie.id,
      nom: choisie.name,
      ...(choisie.startAt ? { dateISO: choisie.startAt.slice(0, 10) } : {}),
      cloturee: choisie.isClosed,
      motions,
    };
  }

  async appliquerOdj(
    meetingId: string,
    supprimerMotionIds: string[],
    bankItemIds: string[],
    libres: ResolutionLibre[],
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

    // 2. Resolutions de la bibliotheque : on recupere leur contenu COMPLET (texte legal,
    // preambule...) au moment de l'ecriture, et on les recree fidelement dans l'AG.
    // (createMotionsFromBank n'accepte pas les ids de bank etablissement.)
    if (bankItemIds.length > 0) {
      const data = await estaleGql<{
        me: { collaborator: { establishment: { motionsBank: BankFull[] } } };
      }>(
        `{ me { collaborator { establishment { motionsBank {
          id type title body majority preamble postamble comment
        } } } } }`,
      );
      const parId = new Map(data.me.collaborator.establishment.motionsBank.map((m) => [m.id, m]));
      for (const id of bankItemIds) {
        const it = parId.get(id);
        if (!it) continue;
        await this.creerMotion(meetingId, {
          type: it.type || "generic",
          title: it.title,
          body: it.body || it.title,
          majority: majorite(it.majority),
          preamble: it.preamble,
          postamble: it.postamble,
          comment: it.comment,
        });
        ajoutees++;
      }
    }

    // Resolutions libres saisies par le gestionnaire.
    for (const l of libres) {
      await this.creerMotion(meetingId, {
        type: "generic",
        title: l.titre,
        body: l.corps || l.titre,
        majority: l.majorite,
      });
      ajoutees++;
    }

    return { supprimees, ajoutees };
  }

  private async creerMotion(meetingId: string, input: MotionInput): Promise<void> {
    await estaleGql(
      `mutation AjoutMotion($id: ID!, $input: MeetingMotionCreateInput!) {
        updateMeeting(id: $id) { createMotion(input: $input) { id } }
      }`,
      { id: meetingId, input },
    );
  }
}
