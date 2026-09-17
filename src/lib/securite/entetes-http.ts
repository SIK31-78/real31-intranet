// Les en-tetes de securite HTTP de l'intranet (audit du 16/09/2026 : aucun n'etait pose).
// Pur : next.config.ts l'appelle au build. La CSP part en REPORT-ONLY : on observe d'abord
// ce qu'elle casserait (Sentry, tesseract, apercus de pieces jointes) via les rapports
// Sentry, puis on la rend bloquante dans un second temps. Les autres en-tetes sont surs.

export interface OptionsEntetes {
  /** DSN Sentry public (NEXT_PUBLIC_SENTRY_DSN) : sert au report-uri de la CSP. */
  dsn?: string;
  /** En dev, Next a besoin d'eval et de HMR : la CSP est adoucie pour ne pas polluer le rapport. */
  dev?: boolean;
}

/** `https://KEY@HOST/PROJET` -> { hote, cle, projet }, ou null si illisible. */
export function decomposerDsn(dsn: string | undefined): { hote: string; cle: string; projet: string } | null {
  const m = /^https:\/\/([^@/]+)@([^/]+)\/(\d+)\/?$/.exec((dsn ?? "").trim());
  return m ? { cle: m[1]!, hote: m[2]!, projet: m[3]! } : null;
}

/** L'endpoint Sentry qui recoit les rapports CSP (public, cle DSN dans l'URL comme le veut Sentry). */
export function reportUriSentry(dsn: string | undefined): string | undefined {
  const d = decomposerDsn(dsn);
  return d ? `https://${d.hote}/api/${d.projet}/security/?sentry_key=${d.cle}` : undefined;
}

export function politiqueCsp(o: OptionsEntetes = {}): string {
  const d = decomposerDsn(o.dsn);
  const sentry = d ? `https://${d.hote}` : "";
  const directives = [
    `default-src 'self'`,
    // Next inline ses scripts d'hydratation ; tesseract charge des workers/wasm en blob.
    `script-src 'self' 'unsafe-inline' blob: 'wasm-unsafe-eval'${o.dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https:`,
    `font-src 'self' data:`,
    // Sentry : les evenements passent par /monitoring (tunnel maison), le replay aussi ;
    // l'hote ingest reste autorise pour le SDK edge/serveur et en secours.
    `connect-src 'self'${sentry ? ` ${sentry}` : ""}${o.dev ? " ws: wss:" : ""}`,
    // Apercus de pieces jointes (PDF / images) en iframe blob:.
    `frame-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];
  const report = reportUriSentry(o.dsn);
  if (report) directives.push(`report-uri ${report}`);
  return directives.join("; ");
}

export function entetesSecurite(o: OptionsEntetes = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy-Report-Only", value: politiqueCsp(o) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ...(o.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
