import { upsertUserState } from '../services/supabaseService.js';

export function setupStartCommand(bot) {
  bot.command('start', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    await upsertUserState(telegramId, { step: 'inicio' }); // Registra o estado inicial
    await ctx.reply('Bem-vindo ao Bot! Use /ajuda para ver os comandos disponíveis.');
  });
}