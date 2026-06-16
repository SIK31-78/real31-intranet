// SSO Microsoft Entra ID (Auth.js v5). Memes noms de variables que le projet App A
// du patron (convention Auth.js par defaut) -> config quasi identique, meme tenant.
// Le provider n'est actif que si les identifiants sont presents ; sinon fallback
// dev-login. Cf. docs/entra-app-registration.md + ADR-017.
//
// Flux : login Microsoft -> id token (email) -> gestionnaire par email dans
// public."User" (cf. lib/auth/session.ts) -> cloisonnement par managerId.

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Le SSO est-il configure (identifiants Entra ID presents) ? */
export const ssoConfigure = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: ssoConfigure
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
        }),
      ]
    : [],
});
