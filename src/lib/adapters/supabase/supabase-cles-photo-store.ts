// Photos des trousseaux : bucket Supabase Storage PRIVE « cles » (ADR-040, premiere brique
// de fichiers du projet). Les chemins sont stockes en base ; l'URL signee (courte) se
// calcule a l'affichage. Le SDK Storage reste confine ici (boundaries).

import type { ClesPhotoStore } from "@/lib/ports/cles-repository";
import { createSupabasePublicClient } from "./public-client";

export const BUCKET_CLES = "cles";
const DUREE_URL_S = 60 * 30;

export class SupabaseClesPhotoStore implements ClesPhotoStore {
  async urlSignee(chemin: string): Promise<string | null> {
    if (!chemin) return null;
    const sb = createSupabasePublicClient();
    const { data, error } = await sb.storage.from(BUCKET_CLES).createSignedUrl(chemin, DUREE_URL_S);
    if (error || !data?.signedUrl) {
      console.warn(`[cles] photo ${chemin} : ${error?.message ?? "pas d'URL"}`);
      return null;
    }
    return data.signedUrl;
  }

  async televerser(chemin: string, contenu: Uint8Array, contentType: string): Promise<void> {
    const sb = createSupabasePublicClient();
    const { error } = await sb.storage.from(BUCKET_CLES).upload(chemin, contenu, { contentType, upsert: true });
    if (error) throw new Error(`Photo ${chemin} : ${error.message}`);
  }
}
