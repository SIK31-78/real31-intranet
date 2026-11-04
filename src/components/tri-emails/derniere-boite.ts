// Derniere boite triee, retenue d'une visite a l'autre (cookie, comme la preference du
// calendrier). Constante a part : un fichier "use client" ne peut pas exporter une valeur
// lisible cote serveur.

/** Nom du cookie. Lu par la page (serveur), ecrit par MemoriserBoite (client). */
export const COOKIE_DERNIERE_BOITE_TRI = "real31_tri_derniere_boite";
