import { BotContext } from '../session';
import { adminSupabase } from '@/lib/supabase';
import { validators } from '@/utils/validators';

export async function handleStartConversation(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;

  try {
    // Processamento do comando de início
    if (session.step === 'email') {
      const email = ctx.message.text;
      
      // Validar formato de email
      if (!validators.email(email)) {
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
  } catch (error) {
    console.error('Erro no processamento do start:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}