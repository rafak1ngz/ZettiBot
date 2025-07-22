// ============================================================================
// TIPOS E CONSTANTES PARA MÓDULO FOLLOWUP
// ============================================================================

// Tipo para os estágios do follow-up
export type EstagioFollowup = 'prospeccao' | 'apresentacao' | 'proposta' | 'negociacao' | 'fechamento';

// Tipo para status do follow-up
export type StatusFollowup = 'ativo' | 'ganho' | 'perdido';

// Mapeamento de emojis por estágio
export const ESTAGIO_EMOJI: Record<EstagioFollowup, string> = {
  'prospeccao': '🔍',
  'apresentacao': '📋',
  'proposta': '💰',
  'negociacao': '🤝',
  'fechamento': '✅'
} as const;

// Mapeamento de texto por estágio
export const ESTAGIO_TEXTO: Record<EstagioFollowup, string> = {
  'prospeccao': '🔍 Prospecção',
  'apresentacao': '📋 Apresentação',
  'proposta': '💰 Proposta',
  'negociacao': '🤝 Negociação',
  'fechamento': '✅ Fechamento'
} as const;

// Mapeamento de status
export const STATUS_TEXTO: Record<StatusFollowup, string> = {
  'ativo': '🔄 Ativos',
  'ganho': '✅ Ganhos',
  'perdido': '❌ Perdidos'
} as const;

// Função utilitária para validar estágio
export function isValidEstagio(estagio: any): estagio is EstagioFollowup {
  return estagio && typeof estagio === 'string' && estagio in ESTAGIO_EMOJI;
}

// Função utilitária para validar status
export function isValidStatus(status: any): status is StatusFollowup {
  return status && typeof status === 'string' && status in STATUS_TEXTO;
}

// Função para obter emoji do estágio de forma segura
export function getEstagioEmoji(estagio: string): string {
  return isValidEstagio(estagio) ? ESTAGIO_EMOJI[estagio] : '📊';
}

// Função para obter texto do estágio de forma segura
export function getEstagioTexto(estagio: string): string {
  return isValidEstagio(estagio) ? ESTAGIO_TEXTO[estagio] : 'Estágio não definido';
}

// Função para obter texto do status de forma segura
export function getStatusTexto(status: string): string {
  return isValidStatus(status) ? STATUS_TEXTO[status] : 'Status não definido';
}