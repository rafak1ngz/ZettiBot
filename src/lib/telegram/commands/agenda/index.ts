import { Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import {
  handleAgenda,
  handleNovoCompromisso,
  handleVincularCliente,
  handleSemCliente,
  handleListarCompromissos,
  handleSelecionarCliente,
  handleEditarCompromisso
} from './handlers';
import { registerAgendaCallbacks } from './callbacks';
import { 
  handleConfiguracoesNotificacao, 
  processarNotificacaoCompromisso 
} from './agenda/notifications';

// ============================================================================
// REGISTRAR TODOS OS COMANDOS E CALLBACKS DE AGENDA
// ============================================================================
export function registerAgendaCommands(bot: Telegraf) {
  
  // ========================================================================
  // COMANDO PRINCIPAL
  // ========================================================================
  bot.command('agenda', handleAgenda);

  // ========================================================================
  // CALLBACKS DO MENU PRINCIPAL
  // ========================================================================
  bot.action('menu_agenda', (ctx) => {
    ctx.answerCbQuery();
    return handleAgenda(ctx);
  });

  //=============================================================================
  // CALLBACKS DE NOTIFICAÇÕES DA AGENDA
  //=============================================================================

  // Callback para mostrar opções de notificação após criar compromisso
  bot.action(/agenda_notificacao_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const compromissoId = ctx.match[1];
      await handleConfiguracoesNotificacao(ctx, compromissoId);
    } catch (error) {
      console.error('Erro no callback de notificação:', error);
      await ctx.reply('Ocorreu um erro ao processar notificação.');
    }
  });

  // Callbacks para diferentes tempos de notificação
  bot.action(/notif_nao_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, 'nao', compromissoId);
  });

  bot.action(/notif_15m_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '15m', compromissoId);
  });

  bot.action(/notif_30m_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '30m', compromissoId);
  });

  bot.action(/notif_1h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '1h', compromissoId);
  });

  bot.action(/notif_5h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '5h', compromissoId);
  });

  bot.action(/notif_12h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '12h', compromissoId);
  });

  bot.action(/notif_24h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '24h', compromissoId);
  });

  // MODIFIQUE O CALLBACK agenda_confirmar EXISTENTE para incluir notificações:
  bot.action('agenda_confirmar', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Obter a sessão atual
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('updated_at', { ascending: false })
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie o processo novamente.');
      }
      
      const session = sessions[0];
      
      // Inserir compromisso
      const { data: novoCompromisso, error: insertError } = await adminSupabase
        .from('compromissos')
        .insert({
          user_id: session.user_id,
          cliente_id: session.data.cliente_id,
          titulo: session.data.titulo,
          descricao: session.data.descricao,
          data_compromisso: session.data.data_compromisso || session.data.data_hora,
          local: session.data.local,
          status: 'pendente',
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();
        
      if (insertError || !novoCompromisso) {
        console.error('Erro ao inserir compromisso:', insertError);
        await ctx.reply('Ocorreu um erro ao salvar o compromisso. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
      // NOVA FUNCIONALIDADE: Redirecionar para configuração de notificações
      await handleConfiguracoesNotificacao(ctx, novoCompromisso.id);
      
    } catch (error) {
      console.error('Erro ao confirmar compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // REGISTRAR TODOS OS CALLBACKS (INCLUINDO NOTIFICAÇÕES)
  // ========================================================================
  registerAgendaCallbacks(bot);

  console.log('✅ Módulo de agenda com notificações registrado com sucesso!');
}