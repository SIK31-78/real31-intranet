import { describe, expect, it } from "vitest";
import { decomposerDsn, entetesSecurite, politiqueCsp, reportUriSentry } from "./entetes-http";

const DSN = "https://abc123@o4512083716145152.ingest.de.sentry.io/4512083726958673";

describe("en-tetes de securite", () => {
  it("lit le DSN et en fait l'endpoint de rapport CSP", () => {
    expect(decomposerDsn(DSN)).toEqual({ cle: "abc123", hote: "o4512083716145152.ingest.de.sentry.io", projet: "4512083726958673" });
    expect(decomposerDsn("n'importe quoi")).toBeNull();
    expect(reportUriSentry(DSN)).toBe("https://o4512083716145152.ingest.de.sentry.io/api/4512083726958673/security/?sentry_key=abc123");
    expect(reportUriSentry(undefined)).toBeUndefined();
  });
  it("la CSP interdit l'iframe, autorise Sentry et les apercus blob, et rapporte a Sentry", () => {
    const csp = politiqueCsp({ dsn: DSN });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://o4512083716145152.ingest.de.sentry.io");
    expect(csp).toContain("frame-src 'self' blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("report-uri https://o4512083716145152.ingest.de.sentry.io/api/4512083726958673/security/?sentry_key=abc123");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(politiqueCsp({ dev: true })).toContain("'unsafe-eval'");
  });
  it("en report-only, avec les en-tetes surs ; HSTS seulement hors dev", () => {
    const prod = entetesSecurite({ dsn: DSN });
    expect(prod.map((e) => e.key)).toEqual([
      "Content-Security-Policy-Report-Only",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Strict-Transport-Security",
    ]);
    expect(prod.find((e) => e.key === "X-Frame-Options")!.value).toBe("DENY");
    expect(entetesSecurite({ dev: true }).some((e) => e.key === "Strict-Transport-Security")).toBe(false);
    expect(entetesSecurite({}).some((e) => e.key === "Content-Security-Policy")).toBe(false);
  });
});
