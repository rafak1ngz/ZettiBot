import { Telegraf } from 'telegraf';
import { userMiddleware } from './middleware/user';
import { conversationMiddleware } from './middleware/conversation/index';
import { registerCommands } from './commands';

// Initialize bot with token
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN must be provided');
}

// Create bot instance
const bot = new Telegraf(token);

//=============================================================================
// MIDDLEWARES - Adicionados antes dos comandos para processar cada mensagem
//=============================================================================
// Middleware para identificar e anexar usuário ao contexto
bot.use(userMiddleware);

// Middleware para processar conversas em andamento
bot.use(conversationMiddleware);

//=============================================================================
// COMANDOS - Registrando todos os comandos do bot
//=============================================================================
// Função que registra todos os comandos (implementada em commands/index.ts)
registerCommands(bot);

export default bot;