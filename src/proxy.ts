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

// Tout est protege sauf :
//   - les assets statiques de Next ;
//   - les routes d'upload/analyse reprise (patrimoine + mapping comptable) : elles recoivent des
//     PDF volumineux (multipart, >4 Mo) que le middleware Edge tronque (-> "Failed to parse body
//     as FormData"). Elles font deja leur propre auth (getGestionnaireCourant) ;
//   - l'API MACHINE /api/v1/** : elle porte sa PROPRE auth (cle Bearer verifiee DANS les
//     handlers, cf. lib/auth/cle-api.ts). Le gate Basic la fermerait aux machines (un client
//     API envoie "Authorization: Bearer ...", pas le Basic partage) ; en SSO le proxy laisse
//     deja tout passer - l'exclusion garde le comportement identique dans les deux modes ;
//   - la fiche de renseignements PUBLIQUE (/fiche/** + /api/fiche/**) : premiere page NON
//     authentifiee de l'app (le coproprietaire n'a pas de compte). En deploiement sans SSO, le
//     gate ci-dessus est un mot de passe partage Basic : il fermerait cette page au public. On
//     l'exclut donc explicitement. La securite de la fiche est portee EN PROPRE (token + code,
//     anti-enumeration, rate-limit) et non par ce gate. En SSO (prod) le middleware laisse deja
//     tout passer (l'auth se fait par page) ; l'exclusion garde le comportement identique.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/reprise/analyser|api/reprise/mapping-analyser|api/v1|fiche|api/fiche).*)",
  ],
};
