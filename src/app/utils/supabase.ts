import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    MONGODB_MODELER_CONFIG?: {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      turnstileSiteKey?: string;
    };
  }
}

const config = window.MONGODB_MODELER_CONFIG;
const url = config?.supabaseUrl?.trim();
const key = config?.supabaseAnonKey?.trim();

export const isSupabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
