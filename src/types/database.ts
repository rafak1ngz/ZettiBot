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
  cnpj: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  segmento: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

// Add other type definitions as needed