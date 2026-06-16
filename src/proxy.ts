// Gate d'acces global (avant la vraie auth Entra ID). Tant que l'app expose la
// vraie data du cabinet, elle ne doit pas etre publique : un mot de passe partage
// suffit pour limiter l'acces au personnel REAL31.
//
// Mot de passe : variable d'env SITE_PASSWORD (defaut "real31"). A definir sur Vercel
// pour le changer sans redeployer le code. Le nom d'utilisateur est ignore.
//
// Convention Next 16 : fichier "proxy" (ex-"middleware").

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MOT_DE_PASSE = process.env.SITE_PASSWORD ?? "real31";
// SSO Microsoft actif (identifiants Azure presents) : c'est lui qui controle
// l'acces (login Entra ID), le mot de passe partage n'a plus lieu d'etre.
const SSO_ACTIF = Boolean(
  process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
);

export function proxy(req: NextRequest) {
  if (SSO_ACTIF) return NextResponse.next();
  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const decode = atob(header.slice(6));
    const motDePasse = decode.slice(decode.indexOf(":") + 1);
    if (motDePasse === MOT_DE_PASSE) return NextResponse.next();
  }
  return new NextResponse("Acces restreint REAL31.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="REAL31 Intranet", charset="UTF-8"' },
  });
}

// Tout est protege sauf les assets statiques de Next.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
