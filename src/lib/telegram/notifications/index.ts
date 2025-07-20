// Exports principais do módulo de notificações
export * from './types';
export * from './utils';
export * from './templates';
export * from './scheduler';
export * from './sender';

// Re-exports das funções mais usadas para facilitar importação
export { 
  criarNotificacao,
  buscarNotificacoesPendentes,
  marcarNotificacaoComoEnviada,
  marcarNotificacaoComoErro,
  cancelarNotificacao
} from './scheduler';

export { 
  processarNotificacoesPendentes,
  testarEnvioNotificacao,
  reprocessarNotificacoesErro
} from './sender';

export {
  gerarMensagemAgenda,
  gerarMensagemFollowup,
  gerarMensagemLembrete,
  gerarMensagemResumo,
  gerarMensagemPersonalizada
} from './templates';

export {
  agora,
  formatarDataHora,
  calcularTempoAntes,
  deveProcessarAgora,
  validarDataAgendamento
} from './utils';