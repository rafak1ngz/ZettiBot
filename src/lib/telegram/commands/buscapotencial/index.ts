// ============================================================================
// BUSCA POTENCIAL CLIENTE - EXPORTS PRINCIPAIS
// ============================================================================

export { 
  handleBuscaPotencial,
  handleBuscaFocada,
  handleBuscaPorArea,
  handleAnaliseMercado,
  handleBuscaRapida
} from './handlers';

export { 
  registerBuscaPotencialCallbacks
} from './callbacks';

export {
  validarLocalizacao,
  validarRaio,
  validarCategoria
} from './validation';

export {
  calcularScorePotencial,
  gerarInsights,
  analisarPadraoClientes
} from './intelligence';

export {
  buscarProspectsGoogle,
  formatarProspect,
  obterDetalhesLocal
} from './integration';