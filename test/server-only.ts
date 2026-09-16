// Doublure de « server-only » pour Vitest : le vrai paquet leve des qu'il est importe hors
// d'un Server Component. Les adaptateurs Supabase l'importent pour interdire tout import
// depuis un composant client ; en test, on ne veut rien de tout ca.
export {};
