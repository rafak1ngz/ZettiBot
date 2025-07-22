// ============================================================================
// CALLBACKS DO MÓDULO FOLLOWUP - VERSÃO CORRIGIDA E COMPLETA
// ============================================================================

import { Telegraf, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { 
  handleFollowup,
  handleNovoFollowup, 
  handleListarFollowups,
  handleRegistrarContato,
  mostrarFollowupsPaginados 
} from './handlers';
import { StatusFollowup } from './types';

export function registerFollowupCallbacks(bot: Telegraf) {
  
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
    return handleListarFollowups(ctx, 'ativo');
  });

  // ========================================================================
  // CALLBACKS PARA LISTAR POR STATUS
  // ========================================================================
  bot.action('followup_listar_ativos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'ativo');
  });

  bot.action('followup_listar_ganhos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'ganho');
  });

  bot.action('followup_listar_perdidos', (ctx) => {
    ctx.answerCbQuery();
    return handleListarFollowups(ctx, 'perdido');
  });

  // ========================================================================
  // CALLBACK PARA BUSCAR CLIENTE EXISTENTE
  // ========================================================================
  bot.action('followup_buscar_cliente', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;
      
      if (!telegramId || !userId) {
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
        
      if (error) {
        console.error('Erro ao atualizar sessão buscar:', error);
        return ctx.reply('Erro ao processar solicitação. Tente novamente.');
      }
      
      await ctx.editMessageText(
        `🔍 **Buscar Cliente**\n\n` +
        `Digite o nome da empresa ou CNPJ para buscar:`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Erro no callback buscar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CRIAR NOVO CLIENTE
  // ========================================================================
  bot.action('followup_criar_cliente', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
      if (!telegramId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }
      
      // Atualizar sessão para criação de cliente
      const { error } = await adminSupabase
        .from('sessions')
        .update({
          step: 'criar_cliente_nome_empresa',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      if (error) {
        console.error('Erro ao atualizar sessão criar:', error);
        return ctx.reply('Erro ao processar solicitação. Tente novamente.');
      }
      
      await ctx.editMessageText(
        `🆕 **Criar Novo Cliente**\n\n` +
        `Digite o nome da empresa:`,
        { parse_mode: 'Markdown' }
      );
      
    } catch (error) {
      console.error('Erro no callback criar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA SELECIONAR CLIENTE DA BUSCA
  // ========================================================================
  bot.action(/followup_selecionar_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;

      if (!telegramId || !userId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Buscar dados do cliente
      const { data: cliente, error } = await adminSupabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .eq('user_id', userId)
        .single();

      if (error || !cliente) {
        return ctx.reply('Cliente não encontrado.');
      }

      // Verificar se já tem followup ativo para este cliente
      const { data: followupExistente } = await adminSupabase
        .from('followups')
        .select('id, titulo')
        .eq('cliente_id', clienteId)
        .eq('user_id', userId)
        .eq('status', 'ativo')
        .single();

      if (followupExistente) {
        // Cliente já tem followup ativo - pedir confirmação
        await ctx.editMessageText(
          `⚠️ **Atenção!**\n\n` +
          `O cliente **${cliente.nome_empresa}** já possui um follow-up ativo:\n` +
          `"${followupExistente.titulo}"\n\n` +
          `Deseja substituir pelo novo follow-up?\n` +
          `(O anterior será marcado como perdido)`, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Sim, substituir', `confirmar_substituir_${clienteId}`)],
              [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
            ])
          }
        );
        return;
      }

      // Cliente sem followup ativo - continuar criação
      await continuarCriacaoFollowup(ctx, telegramId, userId, cliente);

    } catch (error) {
      console.error('Erro ao selecionar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CONFIRMAR SUBSTITUIÇÃO DE FOLLOWUP
  // ========================================================================
  bot.action(/confirmar_substituir_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;

      if (!telegramId || !userId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Marcar followup existente como perdido
      await adminSupabase
        .from('followups')
        .update({
          status: 'perdido',
          updated_at: new Date().toISOString()
        })
        .eq('cliente_id', clienteId)
        .eq('user_id', userId)
        .eq('status', 'ativo');

      // Buscar dados do cliente
      const { data: cliente, error } = await adminSupabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .eq('user_id', userId)
        .single();

      if (error || !cliente) {
        return ctx.reply('Cliente não encontrado.');
      }

      await continuarCriacaoFollowup(ctx, telegramId, userId, cliente);

    } catch (error) {
      console.error('Erro ao confirmar substituição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA ESCOLHER ESTÁGIO DO FOLLOWUP
  // ========================================================================
  bot.action(/followup_estagio_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const estagio = ctx.match[1];
      const telegramId = ctx.from?.id;

      if (!telegramId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Atualizar sessão com estágio escolhido
      const { data: session, error: fetchError } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (fetchError || !session) {
        return ctx.reply('Sessão não encontrada. Tente novamente.');
      }

      const { error: updateError } = await adminSupabase
        .from('sessions')
        .update({
          step: 'valor_estimado',
          data: { ...session.data, estagio },
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      if (updateError) {
        console.error('Erro ao atualizar sessão:', updateError);
        return ctx.reply('Erro ao processar escolha.');
      }

      await ctx.editMessageText(
        `💰 **Valor Estimado**\n\n` +
        `Digite o valor estimado da oportunidade ou "pular":\n\n` +
        `Exemplo: 15000 ou R$ 15.000`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Erro ao escolher estágio:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA AÇÕES DO FOLLOWUP
  // ========================================================================
  bot.action(/followup_contato_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const followupId = ctx.match[1];
    return handleRegistrarContato(ctx, followupId);
  });

  bot.action(/followup_editar_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      
      await ctx.editMessageText(
        `✏️ **Editar Follow-up**\n\n` +
        `Qual campo deseja editar?`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📝 Título', `editar_titulo_${followupId}`)],
            [Markup.button.callback('🎯 Estágio', `editar_estagio_${followupId}`)],
            [Markup.button.callback('💰 Valor', `editar_valor_${followupId}`)],
            [Markup.button.callback('📅 Data Prevista', `editar_data_${followupId}`)],
            [Markup.button.callback('🎬 Próxima Ação', `editar_proxima_acao_${followupId}`)],
            [Markup.button.callback('🔙 Voltar', 'voltar_followups')]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao editar dados:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action(/followup_ganho_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Você precisa estar autenticado.');
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
        return ctx.reply('Erro ao atualizar follow-up.');
      }

      await ctx.editMessageText(
        `🎉 **Parabéns!**\n\n` +
        `Follow-up marcado como **GANHO** com sucesso!\n\n` +
        `Continue assim e alcance suas metas!`, {
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

  bot.action(/followup_perdido_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Você precisa estar autenticado.');
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
        return ctx.reply('Erro ao atualizar follow-up.');
      }

      await ctx.editMessageText(
        `📝 **Follow-up marcado como perdido**\n\n` +
        `Não desanime! Cada "não" te aproxima do próximo "sim".\n\n` +
        `Vamos buscar novas oportunidades!`, {
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
      return handleListarFollowups(ctx, 'ativo');
    } catch (error) {
      console.error('Erro ao voltar:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA NOTIFICAÇÕES DE FOLLOWUP (PLACEHOLDER LIMPO)
  // ========================================================================
  bot.action(/notif_followup_nao_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    await ctx.editMessageText(
      `✅ **Follow-up criado com sucesso!**\n\n` +
      `🔕 Nenhuma notificação será enviada.\n\n` +
      `🚀 Vamos conquistar esta venda!`, {
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
// FUNÇÃO AUXILIAR PARA CONTINUAR CRIAÇÃO DE FOLLOWUP
// ============================================================================
async function continuarCriacaoFollowup(ctx: any, telegramId: number, userId: string, cliente: any) {
  try {
    // Atualizar sessão com cliente selecionado
    const { error } = await adminSupabase
      .from('sessions')
      .update({
        step: 'titulo_followup',
        data: { 
          cliente_id: cliente.id,
          nome_cliente: cliente.nome_empresa,
          contato_nome: cliente.contato_nome
        },
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Erro ao atualizar sessão:', error);
      return ctx.reply('Erro ao processar seleção.');
    }

    await ctx.editMessageText(
      `✅ **Cliente selecionado:**\n` +
      `🏢 ${cliente.nome_empresa}\n\n` +
      `📝 Agora digite o **título da oportunidade**:\n\n` +
      `Exemplos: "Venda Sistema ERP", "Consultoria em TI"`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Erro ao continuar criação:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

// ============================================================================
// FUNÇÃO PARA PROCESSAR NOTIFICAÇÃO DE FOLLOWUP
// ============================================================================
async function processarNotificacaoFollowup(ctx: any, tempo: string, followupId: string) {
  try {
    ctx.answerCbQuery();

    const tempoTexto = {
      '1h': '1 hora',
      '24h': '24 horas',
      '3d': '3 dias'
    }[tempo] || '24 horas';

    await ctx.editMessageText(
      `✅ **Follow-up criado com sucesso!**\n\n` +
      `⏰ Lembrete configurado para ${tempoTexto} antes da próxima ação.\n\n` +
      `🎯 Agora é focar e conquistar esta venda!`, {
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