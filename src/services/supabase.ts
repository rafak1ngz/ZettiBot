import { createClient } from '@supabase/supabase-js';

// Use variáveis de ambiente do Vercel
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Criar e exportar o cliente
export const supabase = createClient(supabaseUrl, supabaseKey);