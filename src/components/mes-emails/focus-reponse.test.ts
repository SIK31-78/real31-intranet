import { describe, expect, it } from "vitest";
import { doitDefilerVersReponse } from "./focus-reponse";

describe("doitDefilerVersReponse", () => {
  it("ne bouge pas la page quand la réponse est déjà entière à l'écran", () => {
    expect(doitDefilerVersReponse({ hautBloc: 240, basZone: 700, hauteurFenetre: 900 })).toBe(false);
  });

  it("remonte la réponse quand son haut est sorti de l'écran (page descendue dans un long mail)", () => {
    expect(doitDefilerVersReponse({ hautBloc: -400, basZone: 100, hauteurFenetre: 900 })).toBe(true);
  });

  it("remonte la réponse quand la zone de texte dépasse en bas (petit écran)", () => {
    expect(doitDefilerVersReponse({ hautBloc: 300, basZone: 1100, hauteurFenetre: 800 })).toBe(true);
  });
});
