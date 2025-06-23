import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Cliente normal para operações com autenticação
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false
  }
});

// Método para desativar RLS temporariamente para operações administrativas
export const withAdminAuth = async (callback: (supabase: any) => Promise<any>) => {
  try {
    return await callback(supabase);
  } catch (error) {
    console.error('Admin operation error:', error);
    throw error;
  }
};