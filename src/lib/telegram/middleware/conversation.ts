import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';

export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Se não for mensagem de texto ou for um comando, não processar como conversa
  if (!ctx.message || !('text' in ctx.message) || ctx.message.text.startsWith('/')) {
    return next();
  }

  // Verificar se há uma conversa ativa
  const activeConversation = ctx.session?.conversationState?.active;
  
  if (!activeConversation) {
    return next();
  }

  // Processar baseado no comando atual e etapa
  const command = ctx.session?.conversationState?.command;
  const step = ctx.session?.conversationState?.step;
  const userId = ctx.state.user?.id;

  console.log(`Processing conversation: command=${command}, step=${step}, userId=${userId}`);

  try {
    if (command === 'start' && step === 'email') {
      const email = ctx.message.text;
      
      // Validar formato de email
      if (!email.includes('@') || !email.includes('.')) {
        await ctx.reply('Por favor, forneça um email válido no formato exemplo@dominio.com');
        return;
      }
      
      if (!userId) {
        await ctx.reply('Erro ao encontrar seu registro. Por favor, tente novamente com /inicio');
        // Resetar estado da conversa
        if (ctx.session?.conversationState) {
          ctx.session.conversationState.active = false;
        }
        return;
      }
      
      console.log(`Updating email for user ${userId} to ${email}`);
      
      // Atualizar email do usuário
      const { error } = await adminSupabase
        .from('users')
        .update({ email })
        .eq('id', userId);
        
      if (error) {
        console.error('Error updating email:', error);
        await ctx.reply('Ocorreu um erro ao salvar seu email. Por favor, tente novamente.');
        return;
      }
      
      // Dar feedback e encerrar conversa
      await ctx.reply(`
Email registrado com sucesso! ✅

Agora você está pronto para usar todas as funcionalidades do ZettiBot.

👉 Digite /ajuda para conhecer os comandos disponíveis.
      `);
      
      // Resetar estado da conversa
      if (ctx.session?.conversationState) {
        ctx.session.conversationState.active = false;
      }
      
      return;
    }
    
    // Adicione aqui handlers para outros comandos e etapas
    
  } catch (error) {
    console.error('Error in conversation middleware:', error);
    await ctx.reply('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
  }
  
  // Se chegou aqui, passar para o próximo middleware
  return next();
};