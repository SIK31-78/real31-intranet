// SSO Microsoft Entra ID (Auth.js v5). Le provider n'est actif que si les
// identifiants Azure sont presents (fournis par le DSI / patron) ; sinon l'app
// retombe sur le selecteur dev-login. Cf. docs/entra-app-registration.md + ADR-017.
//
// Flux : login Microsoft -> id token (email) -> on retrouve le gestionnaire par
// email dans public."User" (cf. lib/auth/session.ts) -> cloisonnement par managerId.

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

/** Le SSO est-il configure (identifiants Azure presents) ? */
export const ssoConfigure = Boolean(
  process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID,
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: ssoConfigure
    ? [
        MicrosoftEntraID({
          clientId: process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
        }),
      ]
    : [],
});
