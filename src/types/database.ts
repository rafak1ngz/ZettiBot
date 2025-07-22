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

// ============================================================================
// NOVAS INTERFACES PARA CORRIGIR O ERRO
// ============================================================================

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

// ============================================================================
// INTERFACE PARA NOTIFICAÇÕES
// ============================================================================

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
// ============================================================================
// INTERFACE PARA LEMBRETES
// ============================================================================

export interface Lembrete {
  id: string;
  user_id: string;
  titulo: string;
  descricao?: string;
  data_lembrete: string;
  prioridade: 'baixa' | 'media' | 'alta';
  status: 'pendente' | 'concluido' | 'cancelado';
  created_at: string;
  updated_at: string;
}

export type PrioridadeLembrete = 'baixa' | 'media' | 'alta';
export type StatusLembrete = 'pendente' | 'concluido' | 'cancelado';


// ============================================================================
// INTERFACES PARA FOLLOWUP
// ============================================================================

export type EstagioFollowup = 
  | 'prospeccao'    // 🔍 Prospecção - Primeiro contato
  | 'apresentacao'  // 📋 Apresentação - Demo do produto  
  | 'proposta'      // 💰 Proposta - Orçamento enviado
  | 'negociacao'    // 🤝 Negociação - Ajustes de preço
  | 'fechamento';   // ✅ Fechamento - Pronto para assinar

export type StatusFollowup = 'ativo' | 'ganho' | 'perdido';

export interface Followup {
  id: string;
  user_id: string;
  cliente_id: string;
  titulo: string;
  estagio: EstagioFollowup;
  valor_estimado?: number;
  data_inicio: string;
  data_prevista?: string;
  ultimo_contato: string;
  proxima_acao?: string;
  descricao?: string;
  status: StatusFollowup;
  created_at: string;
  updated_at: string;
}

// Interface para followup com dados do cliente
export interface FollowupComCliente extends Followup {
  clientes?: Cliente | null;
}

// Interface para queries específicas
export interface FollowupQuery {
  id: string;
  user_id: string;
  cliente_id: string;
  titulo: string;
  estagio: EstagioFollowup;
  valor_estimado?: number;
  data_inicio: string;
  data_prevista?: string;
  ultimo_contato: string;
  proxima_acao?: string;
  descricao?: string;
  status: StatusFollowup;
  created_at: string;
  updated_at: string;
  clientes?: {
    nome_empresa: string;
    contato_nome?: string;
    contato_telefone?: string;
  } | null;
}