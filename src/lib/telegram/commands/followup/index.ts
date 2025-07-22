// ============================================================================
// EXPORTS DO MÓDULO FOLLOWUP - VERSÃO ATUALIZADA
// ============================================================================

export { 
  handleFollowup, 
  handleNovoFollowup, 
  handleListarFollowups,
  handleRegistrarContato,
  mostrarFollowupsPaginados 
} from './handlers';

export { registerFollowupCallbacks } from './callbacks';

// Exportar tipos e utilitários
export type { EstagioFollowup, StatusFollowup } from './types';
export { 
  ESTAGIO_EMOJI, 
  ESTAGIO_TEXTO, 
  STATUS_TEXTO,
  isValidEstagio,
  isValidStatus,
  getEstagioEmoji,
  getEstagioTexto,
  getStatusTexto
} from './types';