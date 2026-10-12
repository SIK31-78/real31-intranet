// Template de la checklist de supervision AG : l'état est stocké PAR ID d'item
// (intranet_supervision_items). Un id en double ou renommé ferait perdre des cochages.

import { describe, expect, it } from "vitest";
import { ITEM_CS_PREPA, ITEM_LIBELLE, SECTIONS_TEMPLATE } from "./supervision-ag-template";

describe("SECTIONS_TEMPLATE", () => {
  it("chaque id d'item est unique (l'état est rattaché par id)", () => {
    const ids = SECTIONS_TEMPLATE.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ITEM_LIBELLE)).toHaveLength(ids.length);
  });

  it("l'annonce de l'AG par mailing ESTALE est un module de la phase « Avant CS » (REA-144)", () => {
    const avantCs = SECTIONS_TEMPLATE.find((s) => s.id === "avant-cs");
    const item = avantCs?.items.find((i) => i.id === "avcs.annonce-ag");
    expect(item).toMatchObject({ module: "annonce_ag" });
    expect(item?.type).toBeUndefined(); // case à cocher : cochable à la main (copro Crypto)
  });

  it("les ids historiques restent en place (cochages existants conservés)", () => {
    const ids = SECTIONS_TEMPLATE.flatMap((s) => s.items.map((i) => i.id));
    expect(ids).toEqual(expect.arrayContaining([ITEM_CS_PREPA, "avcs.avancement-tx", "apcs.honos", "apag.recap-reality"]));
  });
});
