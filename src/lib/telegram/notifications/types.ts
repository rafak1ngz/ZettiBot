export type TipoNotificacao = 'agenda' | 'followup' | 'lembrete' | 'resumo';

export type StatusNotificacao = 'pendente' | 'enviado' | 'erro' | 'cancelado';

export interface CriarNotificacaoInput {
  user_id: string;
  telegram_id: number;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  agendado_para: Date;
  metadata?: Record<string, any>;
}

export interface NotificacaoProcessamento {
  id: string;
  user_id: string;
  telegram_id: number;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  agendado_para: string;
  status: StatusNotificacao;
  tentativas: number;
  metadata?: Record<string, any>;
}

export interface ResultadoProcessamento {
  total_processadas: number;
  total_enviadas: number;
  total_erros: number;
  tempo_processamento: number;
  detalhes: {
    enviadas: string[];
    erros: Array<{
      id: string;
      erro: string;
    }>;
  };
}