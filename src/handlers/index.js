const clientHandlers = require('./clients');
const appointmentHandlers = require('./appointments');
const followupHandlers = require('./followups');
const commandHandlers = require('./commands');
const stateHandler = require('./stateHandler');

function setupHandlers(bot) {
  // Limpar handlers anteriores (por segurança)
  bot._textRegexpCallbacks = [];
  
  // Registro de handlers
  commandHandlers.register(bot);
  clientHandlers.register(bot);
  appointmentHandlers.register(bot);
  followupHandlers.register(bot);
  
  // Handler para gerenciar estados
  stateHandler.register(bot);
  
  console.log('Handlers configurados');
}

module.exports = { setupHandlers };