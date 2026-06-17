// Adapter eStale de la bibliotheque de resolutions (ADR-024) : lit la "motion bank"
// du cabinet (niveau etablissement) via me.collaborator.establishment.motionsBank.
// LECTURE SEULE. Les ecritures (creer des motions sur une AG) viendront ensuite,
// avec prudence (ce sont des ecritures reelles dans eStale).

import type { BibliothequeResolutionsProvider } from "@/lib/ports/bibliotheque-resolutions";
import type { MajoriteResolution, Resolution } from "@/lib/domain/resolution";
import { texteSimple } from "@/lib/domain/resolution";
import { estaleGql } from "./client";

type BankItem = {
  id: string;
  title: string;
  body: string | null;
  majority: string;
  isDefault: boolean;
  keywords: string[] | null;
};

const MAJORITES = new Set<MajoriteResolution>([
  "A24",
  "A25",
  "A25_1",
  "A26",
  "A26_1",
  "UNANIMITY",
  "QUESTION",
]);

function majorite(v: string): MajoriteResolution {
  return MAJORITES.has(v as MajoriteResolution) ? (v as MajoriteResolution) : "QUESTION";
}

const QUERY = `query BibliothequeCabinet {
  me {
    collaborator {
      establishment {
        motionsBank { id title body majority isDefault keywords }
      }
    }
  }
}`;

export class EstaleBibliothequeResolutions implements BibliothequeResolutionsProvider {
  async listerCabinet(): Promise<Resolution[]> {
    const data = await estaleGql<{
      me: { collaborator: { establishment: { motionsBank: BankItem[] | null } | null } };
    }>(QUERY);
    const items = data.me?.collaborator?.establishment?.motionsBank ?? [];
    return items.map((it) => ({
      id: it.id,
      titre: it.title,
      corps: texteSimple(it.body ?? ""),
      majorite: majorite(it.majority),
      motsCles: it.keywords ?? [],
      parDefaut: it.isDefault,
    }));
  }
}
