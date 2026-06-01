// Placeholder pre-codegen.
// Sera ecrase par `pnpm db:types` une fois la migration appliquee au cloud
// (cf. docs/supabase-setup.md). Suffit a typer les factories de clients ;
// les requetes typees (.from('xxx')) ne marcheront qu'apres le codegen reel.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  real31_intranet: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
