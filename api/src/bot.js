const TelegramBot = require('node-telegram-bot-api');

// Configuração via variável de ambiente
const BOT_TOKEN = process.env.BOT_TOKEN;

// Verificar se o token está definido
if (!BOT_TOKEN) {
  console.error('ERRO: BOT_TOKEN não definido nas variáveis de ambiente');
}

// Função para inicializar o bot
function setupBot() {
  const bot = new TelegramBot(BOT_TOKEN);
  console.log('Bot inicializado com token:', BOT_TOKEN.substring(0, 10) + '...');

  // Adicionar listener de erro
  bot.on('polling_error', (error) => {
    console.error('Erro de polling:', error);
  });

  // Adicionar listener de webhook
  bot.on('webhook_error', (error) => {
    console.error('Erro de webhook:', error);
  });

  return bot;
}

module.exports = { setupBot };