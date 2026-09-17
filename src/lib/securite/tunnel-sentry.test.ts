import { describe, expect, it } from "vitest";
import { destinationEnveloppe } from "./tunnel-sentry";

const DSN = "https://abc123@o4512083716145152.ingest.de.sentry.io/4512083726958673";
const enveloppe = (dsn: string) => `${JSON.stringify({ dsn, sent_at: "2026-09-17T08:00:00Z" })}\n{"type":"event"}\n{"message":"x"}`;

describe("tunnel Sentry maison", () => {
  it("relaie une enveloppe qui porte notre DSN, vers notre projet seulement", () => {
    expect(destinationEnveloppe(enveloppe(DSN), DSN)).toBe("https://o4512083716145152.ingest.de.sentry.io/api/4512083726958673/envelope/");
  });
  it("refuse un autre projet, une autre organisation, une autre cle, une enveloppe illisible, ou sans DSN configure", () => {
    expect(destinationEnveloppe(enveloppe("https://abc123@o4512083716145152.ingest.de.sentry.io/999"), DSN)).toBeNull();
    expect(destinationEnveloppe(enveloppe("https://abc123@o1.ingest.sentry.io/4512083726958673"), DSN)).toBeNull();
    expect(destinationEnveloppe(enveloppe("https://autre@o4512083716145152.ingest.de.sentry.io/4512083726958673"), DSN)).toBeNull();
    expect(destinationEnveloppe("pas du json\n{}", DSN)).toBeNull();
    expect(destinationEnveloppe("{}\n{}", DSN)).toBeNull();
    expect(destinationEnveloppe(enveloppe(DSN), undefined)).toBeNull();
  });
});
