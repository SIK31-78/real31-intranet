// Adapter mock du referentiel des agences. Ids coherents avec le mock des gestionnaires
// (agence-lgc / agence-ml / agence-hls / agence-asn) pour demontrer le cloisonnement
// par agence offline. Codes alignes sur la vraie table Agency (ML / LGC / HLS / ASN).

import type { AgenceRepository, Agence } from "@/lib/ports/agence-repository";

const AGENCES: Agence[] = [
  { id: "agence-ml", code: "ML" },
  { id: "agence-lgc", code: "LGC" },
  { id: "agence-hls", code: "HLS" },
  { id: "agence-asn", code: "ASN" },
];

export class MockAgenceRepository implements AgenceRepository {
  async listerAgences(): Promise<Agence[]> {
    return AGENCES;
  }
}
