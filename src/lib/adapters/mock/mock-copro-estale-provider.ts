// Adapter mock du CoproEstaleProvider : 2 copros eStale synthetiques (une avec equipe +
// agence + managerId, une orpheline sans gestionnaire) pour demontrer la fusion et le
// cloisonnement offline. SANS dates (comme le vrai provider) : le composite les complete.

import type { CoproEstaleProvider } from "@/lib/ports/copro-estale-provider";
import type { Copropriete } from "@/lib/domain/copropriete";
import { normaliserRef } from "@/lib/domain/copro-fusion";

const COPROS: Copropriete[] = [
  {
    code: "S300",
    source: "estale",
    nom: "BEZONS71CA",
    adresse: { ligne1: "71 rue de Bezons", codePostal: "95870", ville: "Bezons" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "-", fin: "-" },
    priseEnGestion: "-",
    equipe: [
      { initiales: "MC", nomComplet: "Mahaut CARTON", role: "gestionnaire" },
      { initiales: "EP", nomComplet: "Elsa PEIXOTO", role: "comptable" },
    ],
    managerId: "user-mahaut",
    agenceId: "agence-hls",
  },
  {
    // Orpheline : aucun collaborateur GESTIONNAIRE -> managerId absent -> hors portefeuille
    // (visible seulement en vue transverse).
    code: "S297",
    source: "estale",
    nom: "Les Pleiades",
    adresse: { ligne1: "11 rue Georges", codePostal: "95870", ville: "Bezons" },
    statut: "active",
    lotsPrincipaux: 0,
    lotsAutres: 0,
    exercice: { debut: "-", fin: "-" },
    priseEnGestion: "-",
    equipe: [{ initiales: "EP", nomComplet: "Elsa PEIXOTO", role: "comptable" }],
    agenceId: "agence-lgc",
  },
];

export class MockCoproEstaleProvider implements CoproEstaleProvider {
  async listerCoprosEstale(): Promise<Copropriete[]> {
    return COPROS.map((c) => ({ ...c }));
  }

  async getCoproEstale(code: string): Promise<Copropriete | null> {
    const cible = normaliserRef(code);
    const c = COPROS.find((x) => normaliserRef(x.code) === cible);
    return c ? { ...c } : null;
  }
}
