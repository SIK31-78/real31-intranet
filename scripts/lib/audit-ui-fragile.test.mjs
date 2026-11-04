import { describe, expect, it } from "vitest";
import { analyserFragile, balises } from "./audit-ui-fragile.mjs";

const regles = (src) => analyserFragile(src).map((t) => t.regle);

describe("balises", () => {
  it("ignore les generiques et les comparaisons, tolere => dans les props", () => {
    const b = balises(`const a: Array<string> = []; <Foo onClick={() => go()} className="a"><p>1 < 2</p></Foo>`);
    expect(b.map((x) => (x.fermante ? "/" : "") + x.nom)).toEqual(["Foo", "p", "/p", "/Foo"]);
  });
});

describe("cont : @container sous un parent flex-col items-start", () => {
  it("detecte le montage du 04/11", () => {
    const src = `<section className="flex flex-col items-start gap-4">\n<div className="@container rounded-lg">x</div>\n</section>`;
    expect(analyserFragile(src)).toEqual([{ regle: "cont", ligne: 2 }]);
  });
  it("ok si le conteneur a une largeur", () => {
    const src = `<section className="flex flex-col items-start"><div className="@container w-full">x</div></section>`;
    expect(regles(src)).toEqual([]);
  });
  it("ok si le parent est w-full ou n'est pas items-start", () => {
    expect(regles(`<s className="flex flex-col items-start w-full"><d className="@container"/></s>`)).toEqual([]);
    expect(regles(`<s className="flex flex-col"><d className="@container"/></s>`)).toEqual([]);
    expect(regles(`<s className="flex flex-row items-start"><d className="@container"/></s>`)).toEqual([]);
  });
  it("ne confond pas avec un parent plus lointain", () => {
    const src = `<s className="flex flex-col items-start"><div><d className="@container"/></div></s>`;
    expect(regles(src)).toEqual([]);
  });
});

describe("table", () => {
  it("<table nu : compte ; sous overflow-x-auto : ok ; <Table : ignore", () => {
    expect(regles(`<div><table><tr/></table></div>`)).toEqual(["table"]);
    expect(regles(`<div className="overflow-x-auto"><table></table></div>`)).toEqual(["table"].slice(1));
    expect(regles(`<div className="rounded"><div className="overflow-auto"><table></table></div></div>`)).toEqual([]);
    expect(regles(`<Table><tr/></Table>`)).toEqual([]);
  });
});

describe("larg", () => {
  it("w-[400px] et plus sans prefixe ; prefixe, max-w et petites largeurs ignores", () => {
    expect(regles(`<div className="w-[640px]"/>`)).toEqual(["larg"]);
    expect(regles(`<div className="min-w-[400px] w-[399px]"/>`)).toEqual(["larg"]);
    expect(regles(`<div className="md:w-[640px] max-w-[900px] w-[320px]"/>`)).toEqual([]);
  });
});

describe("larg dans un conteneur qui defile", () => {
  it("min-w sous overflow-x-auto : ignore", () => {
    expect(regles(`<div className="overflow-x-auto"><table className="min-w-[720px]"></table></div>`)).toEqual([]);
  });
});
