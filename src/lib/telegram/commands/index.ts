import { Telegraf } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda } from './ajuda';
import { handleClientes } from './clientes';
import { handleAgenda } from './agenda';

export const registerCommands = (bot: Telegraf) => {
  // Registrar comandos básicos
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  bot.command('clientes', handleClientes);
  bot.command('agenda', handleAgenda);

  // Registrar comandos de ajuda específicos
  bot.command('ajuda_clientes', (ctx) => handleAjuda(ctx, 'clientes'));
  bot.command('ajuda_agenda', (ctx) => handleAjuda(ctx, 'agenda'));
  
  // Registrar middlewares para estado de conversa
  bot.on('text', async (ctx, next) => {
    // Handle conversation state (to be implemented)
    return next();
  });
};