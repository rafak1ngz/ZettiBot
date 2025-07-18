import { MiddlewareFn } from 'telegraf';
import { BotContext } from '../session';
import { adminSupabase } from '@/lib/supabase';
import { handleStartConversation } from './startConversation';
import { handleClientesConversation } from './clientesConversation';
import { handleAgendaConversation } from './agendaConversation';

// Função de cancelamento compartilhada
export async function cancelarOperacao(ctx: BotContext, telegramId: number) {
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

    // Mensagem de cancelamento
    await ctx.reply(`
❌ Operação cancelada com sucesso!

Você pode começar uma nova ação digitando /inicio ou escolhendo uma opção no menu.
    `);
    
    return true;
  } catch (error) {
    console.error('Erro inesperado no cancelamento:', error);
    await ctx.reply('Ocorreu um erro ao cancelar a operação.');
    return false;
  }
}

export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Se não for mensagem de texto ou for um comando, não processar como conversa
  if (!ctx.message || !('text' in ctx.message)) {
    return next();
  }
  
  // Verificar se é o comando /cancelar
  if (ctx.message.text.toLowerCase() === '/cancelar') {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      await cancelarOperacao(ctx, telegramId);
      return; // Encerra o processamento após cancelar
    }
  }
  
  // Verificar se é outro comando
  if (ctx.message.text.startsWith('/')) {
    return next();
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  try {
    console.log(`Checking for active conversations for telegramId: ${telegramId}`);

    // Verificar se há uma sessão ativa para este usuário
    const { data: sessions, error } = await adminSupabase
      .from('sessions')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching session:', error);
      return next();
    }

    if (!sessions || sessions.length === 0) {
      console.log('No active session found');
      return next();
    }

    const session = sessions[0];
    console.log(`Found active session: command=${session.command}, step=${session.step}`);

    // Router por comando
    switch (session.command) {
      case 'start':
        return handleStartConversation(ctx, session);
      case 'clientes':
        return handleClientesConversation(ctx, session);
      case 'agenda':
        return handleAgendaConversation(ctx, session);
      default:
        console.log(`Unknown command: ${session.command}`);
        return next();
    }

  } catch (error) {
    console.error('Error in conversation middleware:', error);
    await ctx.reply('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
  }

  return next();
};