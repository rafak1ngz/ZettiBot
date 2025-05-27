const { Telegraf } = require('telegraf');
const winston = require('winston');

// Configuração via variável de ambiente
const BOT_TOKEN = process.env.BOT_TOKEN;

// Verificar se o token está definido
if (!BOT_TOKEN) {
  winston.error('ERRO: BOT_TOKEN não definido nas variáveis de ambiente');
  process.exit(1);
}

// Função para inicializar o bot
function setupBot() {
  try {
    const bot = new Telegraf(BOT_TOKEN);

    winston.info('Bot inicializado com token:', BOT_TOKEN.substring(0, 10) + '...');

    // Adicionar middleware de erro
    bot.catch((err, ctx) => {
      winston.error(`Erro no bot: ${err}`);
      ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    });

    return bot;
  } catch (error) {
    winston.error('Erro ao configurar o bot:', error);
    process.exit(1);
  }
}

module.exports = { setupBot };