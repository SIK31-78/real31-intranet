import type { MetadataRoute } from "next";

// Manifeste PWA : rend l'intranet installable (icone sur l'ecran d'accueil du telephone,
// fenetre a part sur l'ordinateur), sans store. Servi par Next a /manifest.webmanifest.
//
// - start_url "/" et non "/accueil" : la racine est le routeur d'accueil par role
//   (src/app/page.tsx -> pageAccueilPour : comptable -> /comptabilite, les autres -> /accueil,
//   sans session -> connexion). Viser /accueil enverrait le comptable sur la mauvaise page.
// - Pas de service worker : Chrome n'en exige plus pour proposer l'installation, et un intranet
//   authentifie aux donnees sensibles ne doit rien laisser en cache sur l'appareil.
// - Le proxy laisse passer ce fichier et les icones sans authentification (src/proxy.ts) :
//   le navigateur les telecharge sans les identifiants, l'installation echouerait sinon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "REAL31",
    short_name: "REAL31",
    description: "Intranet du cabinet REAL31",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Sapin du rail de navigation (--color-rail) pour la barre d'etat, blanc comme le fond
    // des icones pour l'ecran de lancement.
    theme_color: "#152A20",
    background_color: "#FFFFFF",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
