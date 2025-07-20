import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// ✅ MELHORIA: Adicionar timeout e retry
const supabaseConfig = {
  auth: { persistSession: false },
  global: {
    headers: {
      'X-Client-Info': 'zettibot@1.0.0'
    }
  },
  // ✅ Timeout de 10 segundos
  fetch: (url: RequestInfo | URL, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000) // 10s timeout
    });
  }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, supabaseConfig);
export const adminSupabase = supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, supabaseConfig)
  : supabase;