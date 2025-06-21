export function setupAjudaCommand(bot) {
  bot.command('ajuda', async (ctx) => {
    const telegramId = ctx.from.id.toString();
    const comandos = [
      '/ajuda - Ver esta mensagem de ajuda',
      '/start - Reiniciar o bot',
      '/clientes - Gerenciar clientes',
      '/agenda - Ver ou agendar compromissos',
      '/followup - Gerenciar follow-ups',
      '/lembrete - Configurar lembretes',
      '/visita - Registrar visita',
      '/buscapotencial - Buscar potenciais clientes',
      '/criarrota - Criar rota otimizada',
      '/cancelar - Cancelar operação atual',
    ].join('\n');

    await ctx.reply(`*Comandos disponíveis:*\n\n${comandos}`, { parse_mode: 'Markdown' });
  });
}