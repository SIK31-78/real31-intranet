// Adapter eStale de l'AG (palier 1, LECTURE SEULE). Resout la copro par reference
// normalisee (S0299 -> S299) via me.collaborator.condos, puis lit les motions de
// l'AG ORDINARY pertinente (non close en priorite). Cf. ADR-024.

import type { AssembleeEstaleProvider } from "@/lib/ports/assemblee-estale-provider";
import type { AssembleeAg, MotionAg } from "@/lib/domain/assemblee";
import type { MajoriteResolution } from "@/lib/domain/resolution";
import { estaleGql } from "./client";

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
  title: string;
  majority: string;
  dk: { name: string } | null;
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
            motions { id rank title majority dk { name } }
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
      }));

    return {
      meetingId: choisie.id,
      nom: choisie.name,
      ...(choisie.startAt ? { dateISO: choisie.startAt.slice(0, 10) } : {}),
      motions,
    };
  }
}
