// Re-export du contexte d'acteur pour les services du module cles. La resolution depuis la
// session (roles, agence) vit dans lib/auth/acteur-cles.ts ; ici, rien que le domaine.

export { estDirectionCles, MESSAGE_HORS_AGENCE, MESSAGE_RESERVE_DIRECTION_CLES, peutOperer, type Acteur } from "@/lib/domain/cles/acteur";
