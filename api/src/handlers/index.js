const clientHandlers = require('./clients');
const appointmentHandlers = require('./appointments');
const followupHandlers = require('./followups');
const commandHandlers = require('./commands');
const stateHandler = require('./stateHandler');

function setupHandlers(bot) {
  try {
    console.log('Iniciando configuração de handlers...');

    // Limpar handlers anteriores
    bot._textRegexpCallbacks = [];
    
    // Registro de handlers
    if (commandHandlers && typeof commandHandlers.register === 'function') {
      commandHandlers.register(bot);
      console.log('Handlers de comandos registrados');
    }

    if (clientHandlers && typeof clientHandlers.register === 'function') {
      clientHandlers.register(bot);
      console.log('Handlers de clientes registrados');
    }

    if (appointmentHandlers && typeof appointmentHandlers.register === 'function') {
      appointmentHandlers.register(bot);
      console.log('Handlers de compromissos registrados');
    }

    if (followupHandlers && typeof followupHandlers.register === 'function') {
      followupHandlers.register(bot);
      console.log('Handlers de follow-ups registrados');
    }

    // Handler para gerenciar estados
    if (stateHandler && typeof stateHandler.register === 'function') {
      stateHandler.register(bot);
      console.log('Handler de estados registrado');
    }

    console.log('Todos os handlers foram configurados com sucesso');
  } catch (error) {
    console.error('Erro ao configurar handlers:', error);
    throw error;  // Re-lança o erro para ser tratado no nível superior
  }
}

module.exports = { setupHandlers };