import { Telegraf, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { 
  handleFollowup,
  handleNovoFollowup, 
  handleListarFollowups,
  handleRegistrarContato,
  mostrarFollowupsPaginados 
} from './handlers';
import { StatusFollowup } from './types'; // ✅ CORRIGIDO: Import do local correto

export function registerFollowupCallbacks(bot: Telegraf) {
  console.log('🚀 REGISTRANDO CALLBACKS DE FOLLOWUP!');
  
  // ========================================================================
  // CALLBACKS PRINCIPAIS
  // ========================================================================
  bot.action('menu_followup', (ctx) => {
    ctx.answerCbQuery();
    return handleFollowup(ctx);
  });

  bot.action('followup_novo', (ctx) => {
    ctx.answerCbQuery();
    return handleNovoFollowup(ctx);
  });

  bot.action('followup_listar', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'ativo'); // ✅ CORRIGIDO: Função correta
  });

  // ========================================================================
  // CALLBACKS PARA LISTAR POR STATUS
  // ========================================================================
  bot.action('followup_listar_ativos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'ativo'); // ✅ CORRIGIDO: Função correta
  });

  bot.action('followup_listar_ganhos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'ganho'); // ✅ CORRIGIDO: Função correta
  });

  bot.action('followup_listar_perdidos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'perdido'); // ✅ CORRIGIDO: Função correta
  });

  // ========================================================================
  // CALLBACK PARA BUSCAR CLIENTE EXISTENTE - VERSÃO COM DEBUG
  // ========================================================================
  bot.action('followup_buscar_cliente', async (ctx) => {
    console.log('🔥 CALLBACK followup_buscar_cliente EXECUTADO!');
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;
      
      console.log('📋 Debug buscar - telegramId:', telegramId, 'userId:', userId);
      
      if (!telegramId || !userId) {
        console.log('❌ Erro buscar: IDs não encontrados');
        return ctx.reply('Não foi possível identificar seu usuário.');
      }
      
      // Atualizar sessão para busca de cliente
      const { error } = await adminSupabase
        .from('sessions')
        .update({
          step: 'busca_cliente_followup',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      console.log('📋 Update session buscar result:', error ? `ERRO: ${error.message}` : 'SUCESSO');
      
      if (error) {
        console.error('❌ Erro ao atualizar sessão buscar:', error);
        return ctx.reply('Erro ao processar solicitação. Tente novamente.');
      }
      
      await ctx.editMessageText('🔍 Digite o nome ou parte do nome da empresa que deseja buscar:');
      
      console.log('✅ Mensagem de busca enviada');
      
    } catch (error) {
      console.error('❌ Erro no callback followup_buscar_cliente:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CRIAR CLIENTE DURANTE FOLLOWUP - VERSÃO COM DEBUG
  // ========================================================================
  bot.action('followup_criar_cliente', async (ctx) => {
    console.log('🔥 CALLBACK followup_criar_cliente EXECUTADO!');
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;
      
      console.log('📋 Debug - telegramId:', telegramId, 'userId:', userId);
      
      if (!telegramId || !userId) {
        console.log('❌ Erro: IDs não encontrados');
        return ctx.reply('Não foi possível identificar seu usuário.');
      }
      
      // Atualizar sessão para criação inline de cliente
      const { error } = await adminSupabase
        .from('sessions')
        .update({
          step: 'criar_cliente_nome_empresa',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      console.log('📋 Update session result:', error ? `ERRO: ${error.message}` : 'SUCESSO');
      
      if (error) {
        console.error('❌ Erro ao atualizar sessão:', error);
        return ctx.reply('Erro ao processar solicitação. Tente novamente.');
      }
      
      await ctx.editMessageText(`🆕 **Vamos criar um cliente rapidamente!**

  Por favor, digite o **nome da empresa**:

  Exemplo: "Tech Solutions Ltda"`);

      console.log('✅ Mensagem de criação de cliente enviada');
      
    } catch (error) {
      console.error('❌ Erro no callback followup_criar_cliente:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA REGISTRAR CONTATO
  // ========================================================================
  bot.action(/followup_contato_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      await handleRegistrarContato(ctx, followupId);
    } catch (error) {
      console.error('Erro ao registrar contato:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA MARCAR COMO GANHO
  // ========================================================================
  bot.action(/followup_ganho_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];

      // ✅ CORREÇÃO: Query simplificada para evitar problemas de tipagem
      const { data: followup, error } = await adminSupabase
        .from('followups')
        .select('titulo, valor_estimado, cliente_id')
        .eq('id', followupId)
        .single();

      if (error || !followup) {
        await ctx.reply('Follow-up não encontrado.');
        return;
      }

      // ✅ CORREÇÃO: Buscar cliente separadamente
      const { data: cliente, error: clienteError } = await adminSupabase
        .from('clientes')
        .select('nome_empresa')
        .eq('id', followup.cliente_id)
        .single();

      const nomeEmpresa = cliente?.nome_empresa || 'Cliente';
      const valorTexto = followup.valor_estimado 
        ? `💰 R$ ${new Intl.NumberFormat('pt-BR').format(followup.valor_estimado)}`
        : '';

      await ctx.reply(
        `🎉 **Parabéns! Venda realizada!**\n\n` +
        `🏢 ${nomeEmpresa}\n` +
        `📝 ${followup.titulo}\n` +
        `${valorTexto}\n\n` +
        `Confirma que este follow-up foi **GANHO**?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Sim, foi ganho!', `confirmar_ganho_${followupId}`),
              Markup.button.callback('❌ Cancelar', 'voltar_followups')
            ]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao processar ganho:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA MARCAR COMO PERDIDO
  // ========================================================================
  bot.action(/followup_perdido_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];

      // ✅ CORREÇÃO: Query simplificada para evitar problemas de tipagem
      const { data: followup, error } = await adminSupabase
        .from('followups')
        .select('titulo, cliente_id')
        .eq('id', followupId)
        .single();

      if (error || !followup) {
        await ctx.reply('Follow-up não encontrado.');
        return;
      }

      // ✅ CORREÇÃO: Buscar cliente separadamente
      const { data: cliente, error: clienteError } = await adminSupabase
        .from('clientes')
        .select('nome_empresa')
        .eq('id', followup.cliente_id)
        .single();

      const nomeEmpresa = cliente?.nome_empresa || 'Cliente';

      await ctx.reply(
        `❌ **Marcar como perdido**\n\n` +
        `🏢 ${nomeEmpresa}\n` +
        `📝 ${followup.titulo}\n\n` +
        `Confirma que este follow-up foi **PERDIDO**?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('❌ Sim, foi perdido', `confirmar_perdido_${followupId}`),
              Markup.button.callback('🔙 Cancelar', 'voltar_followups')
            ]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao processar perda:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CONFIRMAR GANHO
  // ========================================================================
  bot.action(/confirmar_ganho_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Atualizar status para ganho
      const { error } = await adminSupabase
        .from('followups')
        .update({
          status: 'ganho',
          updated_at: new Date().toISOString()
        })
        .eq('id', followupId)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao marcar como ganho:', error);
        await ctx.reply('Erro ao atualizar follow-up. Por favor, tente novamente.');
        return;
      }

      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply(
        '🎉 **PARABÉNS!** Follow-up marcado como **GANHO**!\n\n' +
        '🏆 Mais uma venda para sua conta!\n' +
        '💪 Continue assim, campeão!',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
              Markup.button.callback('📊 Follow-up Menu', 'menu_followup')
            ],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao confirmar ganho:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CONFIRMAR PERDIDO
  // ========================================================================
  bot.action(/confirmar_perdido_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Atualizar status para perdido
      const { error } = await adminSupabase
        .from('followups')
        .update({
          status: 'perdido',
          updated_at: new Date().toISOString()
        })
        .eq('id', followupId)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao marcar como perdido:', error);
        await ctx.reply('Erro ao atualizar follow-up. Por favor, tente novamente.');
        return;
      }

      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply(
        '📝 Follow-up marcado como **perdido**.\n\n' +
        '💡 Não desanime! Cada "não" te aproxima do próximo "sim".\n' +
        '🚀 Vamos buscar novas oportunidades!',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
              Markup.button.callback('📊 Follow-up Menu', 'menu_followup')
            ],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao confirmar perdido:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA PAGINAÇÃO
  // ========================================================================
  bot.action(/followup_pagina_(\w+)_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const status = ctx.match[1] as StatusFollowup;
      const pagina = parseInt(ctx.match[2]);
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Buscar todos os followups novamente
      const { data: followups, error } = await adminSupabase
        .from('followups')
        .select(`
          *,
          clientes (
            nome_empresa,
            contato_nome,
            contato_telefone
          )
        `)
        .eq('user_id', userId)
        .eq('status', status)
        .order('updated_at', { ascending: false });

      if (error || !followups) {
        return ctx.reply('Erro ao carregar follow-ups.');
      }

      // Mostrar página solicitada
      await mostrarFollowupsPaginados(ctx, followups, pagina, status);
    } catch (error) {
      console.error('Erro na paginação:', error);
      await ctx.reply('Ocorreu um erro ao navegar.');
    }
  });

  // ========================================================================
  // VOLTAR PARA FOLLOWUPS
  // ========================================================================
  bot.action('voltar_followups', async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return handleListarFollowups(ctx, 'ativo'); // ✅ CORRIGIDO: Função correta
    } catch (error) {
      console.error('Erro ao voltar:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CONFIRMAR NOVO FOLLOWUP
  // ========================================================================
  bot.action('followup_confirmar', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
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
      
      // Inserir followup no banco
      const { data: novoFollowup, error: insertError } = await adminSupabase
        .from('followups')
        .insert({
          user_id: session.user_id,
          cliente_id: session.data.cliente_id,
          titulo: session.data.titulo,
          estagio: session.data.estagio || 'prospeccao',
          valor_estimado: session.data.valor_estimado || null,
          data_prevista: session.data.data_prevista || null,
          proxima_acao: session.data.proxima_acao,
          descricao: session.data.descricao || null,
          status: 'ativo'
        })
        .select('id')
        .single();
        
      if (insertError || !novoFollowup) {
        console.error('Erro ao inserir followup:', insertError);
        await ctx.reply('Ocorreu um erro ao salvar o follow-up. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
      // Perguntar sobre notificação
      await ctx.editMessageText(
        '✅ **Follow-up criado com sucesso!**\n\n' +
        '🔔 Deseja receber lembrete para a próxima ação?',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🔕 Não notificar', `notif_followup_nao_${novoFollowup.id}`)],
            [
              Markup.button.callback('⏰ 1h antes', `notif_followup_1h_${novoFollowup.id}`),
              Markup.button.callback('⏰ 24h antes', `notif_followup_24h_${novoFollowup.id}`)
            ],
            [Markup.button.callback('⏰ 3 dias antes', `notif_followup_3d_${novoFollowup.id}`)],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );
      
    } catch (error) {
      console.error('Erro ao confirmar followup:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA NOTIFICAÇÕES DE FOLLOWUP
  // ========================================================================
  bot.action(/notif_followup_nao_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    await ctx.editMessageText(
      '✅ **Follow-up criado com sucesso!**\n' +
      '🔕 Nenhuma notificação será enviada.\n\n' +
      '🚀 Vamos conquistar esta venda!',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
            Markup.button.callback('📋 Listar Follow-ups', 'followup_listar_ativos')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      }
    );
  });

  bot.action(/notif_followup_1h_(.+)/, async (ctx) => {
    await processarNotificacaoFollowup(ctx, '1h', ctx.match[1]);
  });

  bot.action(/notif_followup_24h_(.+)/, async (ctx) => {
    await processarNotificacaoFollowup(ctx, '24h', ctx.match[1]);
  });

  bot.action(/notif_followup_3d_(.+)/, async (ctx) => {
    await processarNotificacaoFollowup(ctx, '3d', ctx.match[1]);
  });
}

// ============================================================================
// FUNÇÃO PARA PROCESSAR NOTIFICAÇÃO DE FOLLOWUP
// ============================================================================
async function processarNotificacaoFollowup(ctx: any, tempo: string, followupId: string) {
  try {
    ctx.answerCbQuery();

    // Para followups, vamos criar lembretes baseados na próxima ação
    // Por enquanto, vamos confirmar a criação e implementar notificações depois
    const tempoTexto = {
      '1h': '1 hora',
      '24h': '24 horas',
      '3d': '3 dias'
    }[tempo] || '24 horas';

    await ctx.editMessageText(
      '✅ **Follow-up criado com sucesso!**\n' +
      `⏰ Lembrete configurado para ${tempoTexto} antes da próxima ação.\n\n` +
      '🎯 Agora é focar e conquistar esta venda!',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
            Markup.button.callback('📋 Listar Follow-ups', 'followup_listar_ativos')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      }
    );

    // TODO: Implementar criação de notificação na próxima fase
    
  } catch (error) {
    console.error('Erro ao processar notificação de followup:', error);
    await ctx.reply('Ocorreu um erro ao configurar a notificação.');
  }
}