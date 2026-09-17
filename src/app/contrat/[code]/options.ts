// Les ajustements de l'ecran de preparation du contrat voyagent en query : l'apercu
// imprimable et le PDF les relisent tels quels, le document reste sans etat.

export type ParamsContrat = {
  ag?: string;
  debut?: string;
  fin?: string;
  honoraires?: string;
  timbres?: string;
  frais?: string;
};

export function lireOptionsContrat({ ag, debut, fin, honoraires, timbres, frais }: ParamsContrat) {
  const nombreOuUndefined = (v?: string) => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? n : undefined;
  };
  return {
    ...(ag ? { dateAgISO: ag } : {}),
    ...(debut ? { debutISO: debut } : {}),
    ...(fin ? { finISO: fin } : {}),
    ...(nombreOuUndefined(honoraires) !== undefined ? { honorairesGestionTtc: nombreOuUndefined(honoraires)! } : {}),
    ...(nombreOuUndefined(timbres) !== undefined ? { forfaitPostauxTtc: nombreOuUndefined(timbres)! } : {}),
    ...(frais !== undefined ? { fraisPostauxReels: frais === "reels" } : {}),
  };
}

/** La query telle qu'elle se repasse de l'apercu au PDF (`?ag=…&honoraires=…`, ou « »). */
export function queryContrat(sp: ParamsContrat): string {
  const q = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `?${q}` : "";
}
