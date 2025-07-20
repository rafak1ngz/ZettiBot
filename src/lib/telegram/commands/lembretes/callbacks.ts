import { Telegraf, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { 
  handleNovoLembrete, 
  handleListarLembretes,
  handleConcluirLembrete,
  mostrarLembretesPaginados 
} from './handlers';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function registerLembretesCallbacks(bot: Telegraf) {
  
  // ========================================================================
  // CALLBACKS PRINCIPAIS
  // ========================================================================
  bot.action('lembrete_criar', (ctx) => {
    ctx.answerCbQuery();
    return handleNovoLembrete(ctx);
  });

  bot.action('lembrete_listar', (ctx) => {
    ctx.answerCbQuery();
    return handleListarLembretes(ctx);
  });

  // ========================================================================
  // CALLBACK PARA CONCLUIR LEMBRETE
  // ========================================================================
  bot.action(/lembrete_concluir_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const lembreteId = ctx.match[1];
      await handleConcluirLembrete(ctx, lembreteId);
    } catch (error) {
      console.error('Erro ao concluir lembrete:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA EXCLUIR LEMBRETE
  // ========================================================================
  bot.action(/lembrete_excluir_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const lembreteId = ctx.match[1];

      // Buscar dados do lembrete para confirmação
      const { data: lembrete, error } = await adminSupabase
        .from('lembretes')
        .select('titulo, data_lembrete')
        .eq('id', lembreteId)
        .single();

      if (error || !lembrete) {
        await ctx.reply('Lembrete não encontrado.');
        return;
      }

      await ctx.reply(
        `⚠️ Tem certeza que deseja excluir este lembrete?\n\n` +
        `📝 **${lembrete.titulo}**\n` +
        `📅 ${new Date(lembrete.data_lembrete).toLocaleString('pt-BR')}\n\n` +
        `Esta ação não pode ser desfeita.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Sim, excluir', `confirmar_exclusao_lembrete_${lembreteId}`),
              Markup.button.callback('❌ Cancelar', 'voltar_lembretes')
            ]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao processar exclusão:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CONFIRMAR EXCLUSÃO
  // ========================================================================
  bot.action(/confirmar_exclusao_lembrete_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const lembreteId = ctx.match[1];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Excluir lembrete (ou marcar como cancelado)
      const { error } = await adminSupabase
        .from('lembretes')
        .update({
          status: 'cancelado'
        })
        .eq('id', lembreteId)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao excluir lembrete:', error);
        await ctx.reply('Erro ao excluir lembrete. Por favor, tente novamente.');
        return;
      }

      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('🗑️ Lembrete excluído com sucesso!');

      return handleListarLembretes(ctx);
    } catch (error) {
      console.error('Erro ao confirmar exclusão:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA EDITAR LEMBRETE
  // ========================================================================
  bot.action(/lembrete_editar_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const lembreteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;

      if (!telegramId || !userId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Buscar dados do lembrete
      const { data: lembrete, error } = await adminSupabase
        .from('lembretes')
        .select('*')
        .eq('id', lembreteId)
        .eq('user_id', userId)
        .single();

      if (error || !lembrete) {
        console.error('Erro ao buscar lembrete:', error);
        await ctx.reply('Lembrete não encontrado.');
        return;
      }

      console.log('=== DEBUG INÍCIO EDIÇÃO ===');
      console.log('Lembrete encontrado:', lembrete);
      console.log('ID do lembrete:', lembrete.id);
      console.log('Tipo do ID:', typeof lembrete.id);
      console.log('===============================');      

      // Criar sessão para edição
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('telegram_id', telegramId);

      await adminSupabase
        .from('sessions')
        .insert([{
          telegram_id: telegramId,
          user_id: userId,
          command: 'lembretes',
          step: 'editar_lembrete',
          data: lembrete,
          updated_at: new Date().toISOString()
        }]);

      await ctx.reply(
        `O que você deseja editar no lembrete "${lembrete.titulo}"?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Título', 'lembrete_edit_titulo')],
          [Markup.button.callback('🎯 Prioridade', 'lembrete_edit_prioridade')],
          [Markup.button.callback('📅 Data', 'lembrete_edit_data')],
          [Markup.button.callback('🕐 Hora', 'lembrete_edit_hora')],
          [Markup.button.callback('💬 Descrição', 'lembrete_edit_descricao')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao iniciar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS DE EDIÇÃO ESPECÍFICOS
  // ========================================================================
  bot.action('lembrete_edit_titulo', async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_titulo_lembrete',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      await ctx.editMessageText('Digite o novo título para o lembrete:');
    } catch (error) {
      console.error('Erro ao editar título:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('lembrete_edit_prioridade', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      await ctx.editMessageText(
        'Selecione a nova prioridade:',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔴 Alta - Urgente', 'prioridade_alta')],
          [Markup.button.callback('🟡 Média - Importante', 'prioridade_media')],
          [Markup.button.callback('🔵 Baixa - Quando possível', 'prioridade_baixa')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao editar prioridade:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('lembrete_edit_data', async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_data_lembrete',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      await ctx.editMessageText('Digite a nova data do lembrete no formato DD/MM/YYYY:', 
        { reply_markup: { inline_keyboard: [] } }
      );
      
      await ctx.reply('Escolha uma opção ou digite a data:',
        Markup.keyboard([
          ['Hoje', 'Amanhã']
        ]).oneTime().resize()
      );
    } catch (error) {
      console.error('Erro ao editar data:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('lembrete_edit_hora', async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_hora_lembrete',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      await ctx.editMessageText(
        'Digite o novo horário do lembrete no formato HH:MM:',
        { reply_markup: { inline_keyboard: [] } }
      );
      
      await ctx.reply('Digite o horário (exemplo: 14:30):', Markup.removeKeyboard());
    } catch (error) {
      console.error('Erro ao editar hora:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('lembrete_edit_descricao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_descricao_lembrete',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      await ctx.editMessageText('Digite a nova descrição do lembrete (ou "pular" para remover):');
    } catch (error) {
      console.error('Erro ao editar descrição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS DE PRIORIDADE
  // ========================================================================
  bot.action('prioridade_alta', async (ctx) => {
    await atualizarPrioridadeLembrete(ctx, 'alta');
  });

  bot.action('prioridade_media', async (ctx) => {
    await atualizarPrioridadeLembrete(ctx, 'media');
  });

  bot.action('prioridade_baixa', async (ctx) => {
    await atualizarPrioridadeLembrete(ctx, 'baixa');
  });

  // ========================================================================
  // CALLBACK PARA PAGINAÇÃO
  // ========================================================================
  bot.action(/lembrete_pagina_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const pagina = parseInt(ctx.match[1]);
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Buscar todos os lembretes novamente
      const { data: lembretes, error } = await adminSupabase
        .from('lembretes')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pendente')
        .order('data_lembrete', { ascending: true });

      if (error || !lembretes) {
        return ctx.reply('Erro ao carregar lembretes.');
      }

      // Mostrar página solicitada
      await mostrarLembretesPaginados(ctx, lembretes, pagina);
    } catch (error) {
      console.error('Erro na paginação:', error);
      await ctx.reply('Ocorreu um erro ao navegar.');
    }
  });

  // ========================================================================
  // VOLTAR PARA LEMBRETES
  // ========================================================================
  bot.action('voltar_lembretes', async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return handleListarLembretes(ctx);
    } catch (error) {
      console.error('Erro ao voltar:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CONFIRMAR NOVO LEMBRETE
  // ========================================================================
  bot.action('lembrete_confirmar', async (ctx) => {
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
      
      // Inserir lembrete no banco
      const { data: novoLembrete, error: insertError } = await adminSupabase
        .from('lembretes')
        .insert({
          user_id: session.user_id,
          titulo: session.data.titulo,
          descricao: session.data.descricao,
          data_lembrete: session.data.data_lembrete,
          prioridade: session.data.prioridade,
          status: 'pendente',
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();
        
      if (insertError || !novoLembrete) {
        console.error('Erro ao inserir lembrete:', insertError);
        await ctx.reply('Ocorreu um erro ao salvar o lembrete. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
      // Perguntar sobre notificação
      await ctx.editMessageText(
        '⏰ Deseja receber notificação deste lembrete?',
        Markup.inlineKeyboard([
          [Markup.button.callback('🔕 Não notificar', `notif_lembrete_nao_${novoLembrete.id}`)],
          [
            Markup.button.callback('⏰ 5 min antes', `notif_lembrete_5m_${novoLembrete.id}`),
            Markup.button.callback('⏰ 15 min antes', `notif_lembrete_15m_${novoLembrete.id}`)
          ],
          [
            Markup.button.callback('⏰ 30 min antes', `notif_lembrete_30m_${novoLembrete.id}`),
            Markup.button.callback('⏰ 1h antes', `notif_lembrete_1h_${novoLembrete.id}`)
          ],
          [Markup.button.callback('⏰ 24h antes', `notif_lembrete_24h_${novoLembrete.id}`)],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao confirmar lembrete:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA NOTIFICAÇÕES DE LEMBRETES
  // ========================================================================
  bot.action(/notif_lembrete_nao_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    await ctx.editMessageText(
      '✅ Lembrete criado com sucesso!\n🔕 Nenhuma notificação será enviada.',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🆕 Novo Lembrete', 'lembrete_criar'),
          Markup.button.callback('📋 Listar Lembretes', 'lembrete_listar')
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );
  });

  bot.action(/notif_lembrete_5m_(.+)/, async (ctx) => {
    await processarNotificacaoLembrete(ctx, '5m', ctx.match[1]);
  });

  bot.action(/notif_lembrete_15m_(.+)/, async (ctx) => {
    await processarNotificacaoLembrete(ctx, '15m', ctx.match[1]);
  });

  bot.action(/notif_lembrete_30m_(.+)/, async (ctx) => {
    await processarNotificacaoLembrete(ctx, '30m', ctx.match[1]);
  });

  bot.action(/notif_lembrete_1h_(.+)/, async (ctx) => {
    await processarNotificacaoLembrete(ctx, '1h', ctx.match[1]);
  });

  bot.action(/notif_lembrete_24h_(.+)/, async (ctx) => {
    await processarNotificacaoLembrete(ctx, '24h', ctx.match[1]);
  });

  // ========================================================================
  // CALLBACK PARA SALVAR EDIÇÃO
  // ========================================================================
  bot.action('lembrete_salvar_edicao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
          
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const lembreteData = session.data;

      // ✅ VALIDAÇÕES DE SEGURANÇA
      if (!lembreteData.id || lembreteData.id === 'undefined') {
        console.error('ID do lembrete inválido:', lembreteData.id);
        await ctx.reply('Erro: Lembrete não identificado. Por favor, tente novamente.');
        return;
      }
      
      if (!session.user_id || session.user_id === 'undefined') {
        console.error('User ID inválido:', session.user_id);
        await ctx.reply('Erro: Usuário não identificado. Por favor, faça login novamente.');
        return;
      }
      
      console.log('=== DEBUG SESSÃO COMPLETA ===');
      console.log('Session completa:', JSON.stringify(session, null, 2));
      console.log('Session.data:', session.data);
      console.log('LembreteData:', lembreteData);
      console.log('LembreteData.id:', lembreteData?.id);
      console.log('Tipo do lembreteData.id:', typeof lembreteData?.id);
      console.log('LembreteData é null?', lembreteData === null);
      console.log('LembreteData é undefined?', lembreteData === undefined);
      console.log('Keys do lembreteData:', lembreteData ? Object.keys(lembreteData) : 'N/A');
      console.log('==============================='); 
      
      // ATUALIZAR com IDs validados
      const { error: updateError } = await adminSupabase
        .from('lembretes')
        .update({
          titulo: lembreteData.titulo,
          descricao: lembreteData.descricao || null,
          data_lembrete: lembreteData.data_lembrete,
          prioridade: lembreteData.prioridade
        })
        .eq('id', lembreteData.id)
        .eq('user_id', session.user_id);
          
      if (updateError) {
        console.error('Erro ao atualizar lembrete:', updateError);
        await ctx.reply('Erro ao salvar alterações. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
      
      await ctx.editMessageText(
        `✅ Alterações salvas com sucesso!\n\n📝 ${lembreteData.titulo}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('📋 Listar Lembretes', 'lembrete_listar'),
            Markup.button.callback('🏠 Menu Principal', 'menu_principal')
          ]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
      await ctx.reply('Ocorreu um erro ao salvar as alterações.');
    }
  });

  
  bot.action('lembrete_continuar_editando', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const lembreteData = session.data;
      
      await ctx.editMessageText(
        `O que você deseja editar no lembrete "${lembreteData.titulo}"?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Título', 'lembrete_edit_titulo')],
          [Markup.button.callback('🎯 Prioridade', 'lembrete_edit_prioridade')],
          [Markup.button.callback('📅 Data', 'lembrete_edit_data')],
          [Markup.button.callback('🕐 Hora', 'lembrete_edit_hora')],
          [Markup.button.callback('💬 Descrição', 'lembrete_edit_descricao')],
          [Markup.button.callback('✅ Finalizar Edição', 'lembrete_finalizar_edicao')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao continuar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // 🔥 VERSÃO CORRIGIDA - SEM ERRO DE TYPESCRIPT
  bot.action('lembrete_finalizar_edicao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const lembreteData = session.data;
      
      // Mostrar confirmação final
      const dataLembreteUTC = new Date(lembreteData.data_lembrete);
      const dataLembreteBrasil = new Date(dataLembreteUTC.getTime() - (3 * 60 * 60 * 1000));
      const dataFormatada = dataLembreteBrasil.toLocaleString('pt-BR');
      
      // 🔥 CORREÇÃO: Garantir tipo correto para evitar erro TypeScript
      const prioridade = lembreteData.prioridade as 'alta' | 'media' | 'baixa';
      const textoPrioridade = {
        alta: '🔴 Alta - Urgente',
        media: '🟡 Média - Importante',
        baixa: '🔵 Baixa - Quando possível'
      }[prioridade] || '⚪ Normal';
        
      await ctx.editMessageText(
        `📋 Confirme as alterações do lembrete:\n\n` +
        `📝 Título: ${lembreteData.titulo}\n` +
        `🎯 Prioridade: ${textoPrioridade}\n` +
        `📅 Data: ${dataFormatada}\n` +
        (lembreteData.descricao ? `💬 Descrição: ${lembreteData.descricao}\n` : '') +
        `\nDeseja salvar as alterações?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Salvar Alterações', 'lembrete_salvar_edicao'),
            Markup.button.callback('✏️ Continuar Editando', 'lembrete_continuar_editando')
          ],
          [
            Markup.button.callback('❌ Cancelar', 'cancelar_acao')
          ]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao finalizar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });
}

// ============================================================================
// FUNÇÃO AUXILIAR PARA ATUALIZAR PRIORIDADE
// ============================================================================
async function atualizarPrioridadeLembrete(ctx: any, novaPrioridade: 'alta' | 'media' | 'baixa') {
  try {
    ctx.answerCbQuery();
    const telegramId = ctx.from?.id;

    // Buscar sessão atual
    const { data: sessions } = await adminSupabase
      .from('sessions')
      .select('*')
      .eq('telegram_id', telegramId)
      .limit(1);

    if (!sessions || sessions.length === 0) {
      return ctx.reply('Sessão expirada. Por favor, tente novamente.');
    }

    const session = sessions[0];

    // ✅ PRESERVAR todos os dados existentes + nova prioridade
    const dadosAtualizados = {
      ...session.data,
      prioridade: novaPrioridade
    };

    await adminSupabase
      .from('sessions')
      .update({
        data: dadosAtualizados,
        step: 'confirmar_edicao',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    const textoPrioridade = {
      alta: '🔴 Alta - Urgente',
      media: '🟡 Média - Importante',
      baixa: '🔵 Baixa - Quando possível'
    }[novaPrioridade];

    // ✅ DIFERENCIAÇÃO: Verificar se é criação ou edição
    const isEdicao = dadosAtualizados.id !== undefined;
    
    if (isEdicao) {
      // É uma EDIÇÃO de lembrete existente
      await ctx.editMessageText(
        `✅ Prioridade atualizada para: ${textoPrioridade}\n\nDeseja salvar as alterações?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Salvar', 'lembrete_salvar_edicao'),
            Markup.button.callback('✏️ Continuar Editando', 'lembrete_continuar_editando')
          ],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    } else {
      // É uma CRIAÇÃO de novo lembrete
      const dataLembreteUTC = new Date(dadosAtualizados.data_lembrete);
      const dataLembreteBrasil = new Date(dataLembreteUTC.getTime() - (3 * 60 * 60 * 1000));
      const dataFormatada = format(dataLembreteBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      await ctx.editMessageText(
        `📋 Confirme os dados do lembrete:\n\n` +
        `📝 Título: ${dadosAtualizados.titulo}\n` +
        `🎯 Prioridade: ${textoPrioridade}\n` +
        `📅 Data: ${dataFormatada}\n` +
        (dadosAtualizados.descricao ? `💬 Descrição: ${dadosAtualizados.descricao}\n` : '') +
        `\nOs dados estão corretos?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar e Criar', 'lembrete_confirmar')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    }

  } catch (error) {
    console.error('Erro ao atualizar prioridade:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

// ============================================================================
// FUNÇÃO PARA PROCESSAR NOTIFICAÇÃO DE LEMBRETE
// ============================================================================
async function processarNotificacaoLembrete(ctx: any, tempo: string, lembreteId: string) {
  try {
    ctx.answerCbQuery();

    // Buscar dados do lembrete
    const { data: lembrete, error } = await adminSupabase
      .from('lembretes')
      .select('*')
      .eq('id', lembreteId)
      .single();

    if (error || !lembrete) {
      console.error('Erro ao buscar lembrete:', error);
      await ctx.reply('Erro ao configurar notificação. Lembrete não encontrado.');
      return;
    }

    // Calcular tempo de antecedência
    const minutosAntes = {
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '24h': 1440
    }[tempo] || 15;

    const agoraUTC = new Date();
    const dataLembreteUTC = new Date(lembrete.data_lembrete);
    const diferencaMinutos = Math.floor((dataLembreteUTC.getTime() - agoraUTC.getTime()) / (1000 * 60));

    // Validações
    if (diferencaMinutos <= 0) {
      await ctx.editMessageText(
        `⚠️ Este lembrete já passou.\n\n✅ Lembrete registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    if (diferencaMinutos <= minutosAntes) {
      await ctx.editMessageText(
        `⚠️ Este lembrete é muito próximo para notificação de ${minutosAntes} minutos antes.\n\n✅ Lembrete registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    // Criar notificação usando o sistema existente
    const { criarNotificacao } = await import('@/lib/telegram/notifications');
    
    const dataNotificacao = new Date(dataLembreteUTC.getTime() - (minutosAntes * 60 * 1000));
    
    // 🔥 CORREÇÃO: Garantir tipo correto para prioridade
    const prioridade = lembrete.prioridade as 'alta' | 'media' | 'baixa';
    const prioridadeTexto = prioridade.charAt(0).toUpperCase() + prioridade.slice(1);
    
    const resultadoNotificacao = await criarNotificacao({
      user_id: lembrete.user_id,
      telegram_id: ctx.from!.id,
      tipo: 'lembrete',
      titulo: 'Lembrete Agendado',
      mensagem: `🔔 Lembrete em ${minutosAntes < 60 ? minutosAntes + ' minutos' : minutosAntes/60 + ' hora(s)'}!\n\n` +
                `📝 ${lembrete.titulo}\n` +
                `🎯 Prioridade: ${prioridadeTexto}\n` +
                (lembrete.descricao ? `💬 ${lembrete.descricao}` : ''),
      agendado_para: dataNotificacao
    });

    if (!resultadoNotificacao.sucesso) {
      await ctx.editMessageText(
        `❌ Erro ao agendar notificação.\n\n✅ Lembrete registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    const tempoTexto = {
      '5m': '5 minutos',
      '15m': '15 minutos',
      '30m': '30 minutos', 
      '1h': '1 hora',
      '24h': '24 horas'
    }[tempo] || '15 minutos';

    await ctx.editMessageText(
      `✅ Lembrete criado com sucesso!\n⏰ Você receberá uma notificação ${tempoTexto} antes.\n\n📝 ${lembrete.titulo}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🆕 Novo Lembrete', 'lembrete_criar'),
          Markup.button.callback('📋 Listar Lembretes', 'lembrete_listar')
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );

  } catch (error) {
    console.error('Erro ao processar notificação de lembrete:', error);
    await ctx.reply('Ocorreu um erro ao configurar a notificação.');
  }
}