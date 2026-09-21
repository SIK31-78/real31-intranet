// La vue choisie (« Mon portefeuille », « Mon agence », « Le cabinet ») : un cookie, borne par
// ce que le collaborateur peut vraiment toucher (services/coproprietes/vue-perimetre). Le
// choix est memorise 30 jours et suivi par l'accueil et les listes.

import { cookies } from "next/headers";
import { vueEffective, type VuePerimetre } from "@/lib/domain/perimetre-ecriture";

export const COOKIE_VUE = "vue_perimetre";

export async function lireVueChoisie(permises: readonly VuePerimetre[]): Promise<VuePerimetre> {
  const brut = (await cookies()).get(COOKIE_VUE)?.value;
  return vueEffective(brut, permises);
}

export async function ecrireVueChoisie(vue: VuePerimetre): Promise<void> {
  (await cookies()).set(COOKIE_VUE, vue, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}
