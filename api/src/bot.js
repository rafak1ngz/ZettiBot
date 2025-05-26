const TelegramBot = require('node-telegram-bot-api');

// Configuração
const BOT_TOKEN = process.env.BOT_TOKEN || '7914192908:AAGXiOU_E4TfR-Kuynf6V_sTgRRyUdN0umM';

// Função para inicializar o bot
function setupBot() {
  const bot = new TelegramBot(BOT_TOKEN);
  console.log('Bot inicializado');
  return bot;
}

module.exports = { setupBot };