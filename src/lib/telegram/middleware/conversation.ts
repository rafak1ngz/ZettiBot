import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';

export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Se não for mensagem de texto ou for um comando, não processar como conversa
  if (!ctx.message || !('text' in ctx.message) || ctx.message.text.startsWith('/')) {
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

    // Processar baseado no comando e etapa
    if (session.command === 'start' && session.step === 'email') {
      const email = ctx.message.text;
      
      // Validar formato de email
      if (!email.includes('@') || !email.includes('.')) {
        await ctx.reply('Por favor, forneça um email válido no formato exemplo@dominio.com');
        return;
      }
      
      console.log(`Updating email for user ${session.user_id} to ${email}`);
      
      // Atualizar email do usuário
      const { error: updateError } = await adminSupabase
        .from('users')
        .update({ email })
        .eq('id', session.user_id);
        
      if (updateError) {
        console.error('Error updating email:', updateError);
        await ctx.reply('Ocorreu um erro ao salvar seu email. Por favor, tente novamente.');
        return;
      }
      
      // Excluir a sessão após processamento
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
      
      // Dar feedback e encerrar conversa
      await ctx.reply(`
Email registrado com sucesso! ✅

Agora você está pronto para usar todas as funcionalidades do ZettiBot.

👉 Digite /ajuda para conhecer os comandos disponíveis.
      `);
      
      return;
    }
    
    // Adicione aqui handlers para outros comandos e etapas
    
  } catch (error) {
    console.error('Error in conversation middleware:', error);
    await ctx.reply('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
  }

  return next();
};