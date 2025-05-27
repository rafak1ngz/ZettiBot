const { registerUser } = require('../utils/database');
const winston = require('winston');

function register(bot) {
  // Handler para /start
  bot.command('start', async (ctx) => {
    try {
      const chatId = ctx.chat.id;
      const name = ctx.from.first_name;
      const username = ctx.from.username;
      
      winston.info(`Processando /start para ${chatId}`);
      
      // Registrar usuário
      await registerUser(chatId, name, username);
      
      await ctx.reply(
        `Olá, ${name}! Eu sou o ZettiBot 🤖

Estou aqui para auxiliar vendedores externos a terem mais produtividade.

Principais comandos:
/agenda - Ver compromissos do dia
/followup - Gerenciar follow-ups
/clientes - Listar clientes
/help - Ver todos os comandos`,
        {
          reply_markup: {
            keyboard: [
              ['/agenda', '/followup'],
              ['/clientes', '/help']
            ],
            resize_keyboard: true
          }
        }
      );
    } catch (error) {
      winston.error(`Erro no comando /start: ${error.message}`);
      await ctx.reply("❌ Ocorreu um erro ao iniciar o bot. Tente novamente.");
    }
  });

  // Handler para /help
  bot.command(['help', 'ajuda'], async (ctx) => {
    try {
      const chatId = ctx.chat.id;
      winston.info(`Processando /help para ${chatId}`);
      
      await ctx.reply(
        `Comandos disponíveis:

📅 Agenda
/agenda - Ver compromissos do dia
/agendar - Adicionar novo compromisso

👥 Clientes
/cliente_add - Cadastrar novo cliente
/clientes - Listar clientes
/buscar_cliente - Buscar cliente

🔄 Follow-up
/followup - Criar novo follow-up
/followups - Listar follow-ups pendentes

💰 Comissões
/comissao - Consultar comissões
/comissao_add - Registrar nova comissão

ℹ️ Outros
/start - Iniciar bot
/help - Mostrar esta lista de comandos`,
        {
          reply_markup: {
            keyboard: [
              ['/agenda', '/agendar'],
              ['/clientes', '/cliente_add'],
              ['/followup', '/comissao']
            ],
            resize_keyboard: true
          }
        }
      );
    } catch (error) {
      winston.error(`Erro no comando /help: ${error.message}`);
      await ctx.reply("❌ Ocorreu um erro ao mostrar os comandos. Tente novamente.");
    }
  });
}

module.exports = { register };