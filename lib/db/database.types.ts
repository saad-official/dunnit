/**
 * PLACEHOLDER. Replaced by `pnpm db:types` once the Supabase project exists:
 *   supabase gen types typescript --linked > lib/db/database.types.ts
 * Keeping a minimal shape here lets the Supabase clients type-check before
 * the schema is deployed.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
