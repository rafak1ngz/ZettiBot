import { Telegraf, Context } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda, getSpecificHelp } from './ajuda';
import { handleClientes } from './clientes';
import { handleAgenda } from './agenda';

export const registerCommands = (bot: Telegraf) => {
  // Registrar comandos básicos
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  bot.command('clientes', handleClientes);
  bot.command('agenda', handleAgenda);

  // Registrar comandos de ajuda específicos
  bot.command('ajuda_clientes', (ctx) => ctx.reply(getSpecificHelp('clientes')));
  bot.command('ajuda_agenda', (ctx) => ctx.reply(getSpecificHelp('agenda')));
  
  // Registrar middlewares para estado de conversa
  bot.on('text', async (ctx, next) => {
    // Handle conversation state (to be implemented)
    return next();
  });
};