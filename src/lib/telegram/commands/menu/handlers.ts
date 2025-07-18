import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';

// Comando para cancelar qualquer operação atual
export async function handleCancelar(ctx: Context) {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return ctx.reply('Não foi possível identificar seu usuário.');
  }

  try {
    // Limpar qualquer sessão ativa
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Erro ao limpar sessão:', error);
      return ctx.reply('Ocorreu um erro ao cancelar a operação.');
    }

    // Mensagem de cancelamento e exibir menu principal
    await ctx.reply(`❌ Operação cancelada com sucesso!`);
    
    // Mostrar o menu principal
    return handleMenuPrincipal(ctx);

  } catch (error) {
    console.error('Erro inesperado no cancelamento:', error);
    return ctx.reply('Ocorreu um erro ao cancelar a operação.');
  }
}

// Função para exibir o menu principal
export async function handleMenuPrincipal(ctx: Context) {
  try {
    await ctx.reply(`
Olá, ${ctx.from?.first_name || 'vendedor'}! 👋 

Bem-vindo ao ZettiBot 🚀, seu assistente digital de vendas.

Escolha uma das opções abaixo:
    `,
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Gerenciar Clientes', 'menu_clientes')],
      [Markup.button.callback('📅 Gerenciar Agenda', 'menu_agenda')],
      [Markup.button.callback('📊 Follow Up', 'menu_followup')],
      [Markup.button.callback('🔔 Lembretes', 'menu_lembretes')],
      [Markup.button.callback('❓ Ajuda', 'menu_ajuda')]
    ])
    );
    return true;
  } catch (error) {
    console.error('Erro ao mostrar menu principal:', error);
    return false;
  }
}