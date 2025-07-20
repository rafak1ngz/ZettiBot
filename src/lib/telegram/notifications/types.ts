export interface Notificacao {
  id: string;
  user_id: string;
  tipo: TipoNotificacao;
  referencia_id?: string;
  titulo: string;
  mensagem?: string;
  data_envio: string;
  minutos_antes?: number;
  canais: CanalNotificacao[];
  recorrencia: TipoRecorrencia;
  status: StatusNotificacao;
  tentativas: number;
  erro_detalhes?: string;
  created_at: string;
  updated_at: string;
  enviado_em?: string;
}

export type TipoNotificacao = 
  | 'agenda'
  | 'lembrete' 
  | 'resumo'
  | 'alerta'
  | 'followup';

export type CanalNotificacao = 'telegram' | 'email';

export type TipoRecorrencia = 
  | 'unica' 
  | 'diaria' 
  | 'semanal' 
  | 'mensal';

export type StatusNotificacao = 
  | 'pendente' 
  | 'enviado' 
  | 'erro' 
  | 'cancelado';

export interface OpcoesNotificacao {
  minutos_antes: number;
  label: string;
  callback_data: string;
}

export interface ConfigNotificacaoAgenda {
  compromisso_id: string;
  user_id: string;
  minutos_antes: number;
  data_compromisso: Date;
  titulo_compromisso: string;
  cliente_nome?: string;
  local?: string;
}

export interface TemplateNotificacao {
  titulo: string;
  mensagem: string;
  emojis?: string;
}

export interface ResultadoEnvio {
  sucesso: boolean;
  erro?: string;
  tentativas: number;
}

// Opções de tempo para notificações
export const OPCOES_TEMPO_NOTIFICACAO: OpcoesNotificacao[] = [
  { minutos_antes: 15, label: '⏰ 15 min antes', callback_data: 'notify_15m' },
  { minutos_antes: 30, label: '⏰ 30 min antes', callback_data: 'notify_30m' },
  { minutos_antes: 60, label: '⏰ 1h antes', callback_data: 'notify_1h' },
  { minutos_antes: 300, label: '⏰ 5h antes', callback_data: 'notify_5h' },
  { minutos_antes: 720, label: '⏰ 12h antes', callback_data: 'notify_12h' },
  { minutos_antes: 1440, label: '⏰ 24h antes', callback_data: 'notify_24h' }
];

export const NO_NOTIFICATION = {
  label: '🔕 Não notificar',
  callback_data: 'notify_none'
};