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

export interface Compromisso {
  id: string;
  user_id: string;
  cliente_id?: string;
  titulo: string;
  descricao?: string;
  data_compromisso: string;
  local?: string;
  status: 'pendente' | 'concluido' | 'cancelado';
  created_at: string;
  updated_at: string;
}

// NOVAS INTERFACES PARA CORRIGIR O ERRO
export interface CompromissoComCliente extends Compromisso {
  clientes?: Cliente | null;
}

export interface CompromissoQuery {
  id: string;
  user_id: string;
  cliente_id?: string;
  titulo: string;
  descricao?: string;
  data_compromisso: string;
  local?: string;
  status: 'pendente' | 'concluido' | 'cancelado';
  created_at: string;
  updated_at: string;
  clientes?: {
    nome_empresa: string;
  } | null;
}

// INTERFACE PARA NOTIFICAÇÕES
export interface Notificacao {
  id: string;
  user_id: string;
  telegram_id: number;
  tipo: 'agenda' | 'followup' | 'lembrete';
  titulo: string;
  mensagem: string;
  agendado_para: string;
  status: 'pendente' | 'enviado' | 'erro';
  tentativas: number;
  erro_detalhes?: string;
  enviado_em?: string;
  created_at: string;
  updated_at: string;
}