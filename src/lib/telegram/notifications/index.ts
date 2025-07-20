// Tipos e interfaces
export * from './types';

// Utilitários
export * from './utils';

// Templates de mensagens
export * from './templates';

// Sistema de agendamento
export {
  agendarNotificacaoCompromisso,
  cancelarNotificacaoCompromisso,
  atualizarNotificacaoCompromisso,
  buscarNotificacoesPendentes,
  marcarNotificacaoEnviada,
  marcarNotificacaoErro
} from './scheduler';

// Sistema de envio
export {
  processarNotificacoesPendentes,
  testarEnvioNotificacao,
  limparNotificacaoAntigas
} from './sender';

// Re-export das constantes mais usadas
export { OPCOES_TEMPO_NOTIFICACAO, NO_NOTIFICATION } from './types';