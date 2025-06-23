// User type definition matching the database
export interface User {
  id: string;
  telegram_id: number;
  email: string | null;
  username: string | null;
  full_name: string | null;
  created_at: string;
  last_active: string | null;
  is_active: boolean;
}

// Cliente type definition
export interface Cliente {
  id: string;
  user_id: string;
  nome_empresa: string;
  cnpj?: string;
  contato_nome?: string;
  contato_telefone?: string;
  contato_email?: string;
  segmento?: string;
  observacoes?: string;
  created_at: string;
  updated_at: string;
}
// Add other type definitions as needed