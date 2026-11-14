import { createClient } from '@supabase/supabase-js'

/**
 * Data-source switch (DECISIONS.md I2). "supabase" talks to the real
 * database; anything else keeps the in-memory prototype.
 */
export const USE_SUPABASE = import.meta.env.VITE_DATA_SOURCE === 'supabase'

const url = import.meta.env.VITE_SUPABASE_URL
/* The publishable key (sb_publishable_…) is the current kind; the legacy anon
   key still works until Supabase retires it (end of 2026). Both are public. */
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

if (USE_SUPABASE && (!url || !anonKey)) {
  throw new Error('VITE_DATA_SOURCE=supabase needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example).')
}

/* Only the public (publishable) key ever reaches the browser. Sessions persist in
   localStorage and refresh automatically (refresh-token rotation is on). */
export const supabase = USE_SUPABASE
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'rw-auth' },
    })
  : null
