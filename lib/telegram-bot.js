import { Telegraf } from 'telegraf';
import { setupStartCommand } from '../bot/commands/start.js';
import { setupAjudaCommand } from '../bot/commands/ajuda.js';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Configura os comandos
setupStartCommand(bot);
setupAjudaCommand(bot);

// Inicia o bot
bot.launch().then(() => console.log('Bot iniciado!'));