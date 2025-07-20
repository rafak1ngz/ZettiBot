export const errorMessages = {
  // Erros gerais
  sessaoExpirada: '⏰ Sua sessão expirou. Digite /inicio para começar novamente.',
  erroGenerico: '😅 Ops! Algo deu errado. Tente novamente em alguns segundos.',
  semPermissao: '🔒 Você precisa estar logado. Digite /inicio para se registrar.',
  
  // Erros de validação
  cnpjInvalido: '📋 CNPJ inválido. Digite apenas números ou use o formato XX.XXX.XXX/XXXX-XX',
  telefoneInvalido: '📞 Telefone inválido. Use o formato (XX) XXXXX-XXXX ou apenas números.',
  emailInvalido: '📧 Email inválido. Use o formato usuario@dominio.com',
  
  // Erros de compromisso
  dataPassado: '📅 Esta data já passou. Escolha uma data futura.',
  horarioPassado: '⏰ Este horário já passou. Escolha um horário futuro.',
  compromissoNaoEncontrado: '🔍 Compromisso não encontrado. Talvez já tenha sido excluído.',
  
  // Sucessos
  sucessoGenerico: '✅ Operação realizada com sucesso!',
  compromissoCriado: '📅 Compromisso criado com sucesso!',
  clienteCriado: '👥 Cliente cadastrado com sucesso!'
};

export const infoMessages = {
  bemVindo: '👋 Olá! Sou o ZettiBot, seu assistente de vendas. Vamos transformar seu dia comercial em resultados incríveis!',
  carregando: '⏳ Processando... Um momento por favor.',
  processandoDados: '🔄 Organizando seus dados...'
};