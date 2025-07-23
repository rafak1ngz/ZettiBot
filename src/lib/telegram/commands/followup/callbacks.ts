// ============================================================================
// CALLBACKS DO MÓDULO FOLLOWUP - VERSÃO FINAL CORRIGIDA
// ============================================================================

import { Telegraf, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  handleFollowup,
  handleNovoFollowup, 
  handleListarFollowups,
  handleRegistrarContato,
  handleVerHistoricoContatos,
  handleVerDetalhesFollowup,
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
        `🔍 **Buscar Cliente Existente**\n\n` +
        `Digite o **nome da empresa** que deseja buscar:\n\n` +
        `💡 Digite pelo menos 2 caracteres`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Erro ao configurar busca:', error);
      await ctx.reply('Ocorreu um erro. Tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CRIAR NOVO CLIENTE
  // ========================================================================
  bot.action('followup_criar_cliente', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
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
        `🏢 **Criar Novo Cliente**\n\n` +
        `Digite o **nome da empresa**:`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Erro ao configurar criação:', error);
      await ctx.reply('Ocorreu um erro. Tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA SELEÇÃO DE ESTÁGIO
  // ========================================================================
  bot.action('estagio_prospeccao', async (ctx) => {
    await processarEstagio(ctx, 'prospeccao');
  });

  bot.action('estagio_apresentacao', async (ctx) => {
    await processarEstagio(ctx, 'apresentacao');
  });

  bot.action('estagio_proposta', async (ctx) => {
    await processarEstagio(ctx, 'proposta');
  });

  bot.action('estagio_negociacao', async (ctx) => {
    await processarEstagio(ctx, 'negociacao');
  });

  bot.action('estagio_fechamento', async (ctx) => {
    await processarEstagio(ctx, 'fechamento');
  });

  // ========================================================================
  // CALLBACKS PARA SELEÇÃO RÁPIDA DE DATA
  // ========================================================================
  bot.action('data_hoje_followup', async (ctx) => {
    await processarDataRapida(ctx, 'hoje');
  });

  bot.action('data_amanha_followup', async (ctx) => {
    await processarDataRapida(ctx, 'amanhã');
  });

  bot.action('data_semana_followup', async (ctx) => {
    await processarDataRapida(ctx, 'próxima semana');
  });

  bot.action('data_pular_followup', async (ctx) => {
    await processarDataRapida(ctx, 'pular');
  });

  // ========================================================================
  // 🆕 NOVOS CALLBACKS PARA DATA DA PRÓXIMA AÇÃO
  // ========================================================================
  bot.action(/data_acao_hoje_(.+)/, async (ctx) => {
    await processarDataProximaAcao(ctx, 'hoje', ctx.match[1]);
  });

  bot.action(/data_acao_amanha_(.+)/, async (ctx) => {
    await processarDataProximaAcao(ctx, 'amanhã', ctx.match[1]);
  });

  bot.action(/data_acao_semana_(.+)/, async (ctx) => {
    await processarDataProximaAcao(ctx, 'esta semana', ctx.match[1]);
  });

  bot.action(/data_acao_prox_semana_(.+)/, async (ctx) => {
    await processarDataProximaAcao(ctx, 'próxima semana', ctx.match[1]);
  });

  bot.action(/data_acao_manual_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const telegramId = ctx.from?.id;
      
      // Atualizar sessão para entrada manual de data
      await adminSupabase
        .from('sessions')
        .update({
          step: 'data_proxima_acao_contato',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      await ctx.editMessageText(
        `📅 **Digite a data e hora específica:**\n\n` +
        `**Formatos aceitos:**\n` +
        `• "25/07" (dia/mês - assume 14:00)\n` +
        `• "25/07 14:30" (com horário)\n` +
        `• "25/07/2025 14:30" (ano completo)\n` +
        `• "amanhã", "sexta-feira"\n` +
        `• "próxima segunda às 15h"\n\n` +
        `⚠️ **Dica:** Se não incluir horário, será 14:00 por padrão.`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Erro ao configurar entrada manual:', error);
      await ctx.reply('Erro ao processar. Tente novamente.');
    }
  });

  bot.action(/data_acao_pular_(.+)/, async (ctx) => {
    await processarDataProximaAcao(ctx, 'pular', ctx.match[1]);
  });

  // ========================================================================
  // CALLBACKS PARA AÇÕES DO FOLLOWUP
  // ========================================================================
  bot.action(/followup_contato_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const followupId = ctx.match[1];
    return handleRegistrarContato(ctx, followupId);
  });

  bot.action(/followup_historico_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const followupId = ctx.match[1];
    return handleVerHistoricoContatos(ctx, followupId);
  });

  bot.action(/followup_detalhes_(.+)/, async (ctx) => {
    ctx.answerCbQuery();
    const followupId = ctx.match[1];
    return handleVerDetalhesFollowup(ctx, followupId);
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
  // CALLBACKS PARA NOTIFICAÇÕES DE FOLLOWUP
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

  // ========================================================================
  // 🆕 CALLBACKS PARA NOTIFICAÇÕES DE CONTATO - MELHORADO
  // ========================================================================
  bot.action(/notif_contato_nao_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.editMessageText(
        `✅ **Contato registrado com sucesso!**\n\n` +
        `🔕 Nenhuma notificação será enviada.\n\n` +
        `🎯 Continue trabalhando esta oportunidade!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('📋 Ver Follow-ups', 'followup_listar_ativos'),
              Markup.button.callback('📞 Novo Contato', `followup_contato_${ctx.match[1]}`)
            ],
            [
              Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
              Markup.button.callback('🏠 Menu Principal', 'menu_principal')
            ]
          ])
        }
      );
    } catch (error) {
      console.error('Erro ao processar resposta:', error);
      await ctx.reply('Ocorreu um erro ao processar sua resposta.');
    }
  });

  bot.action(/notif_contato_15m_(.+)/, async (ctx) => {
    await processarNotificacaoContato(ctx, '15m', ctx.match[1]);
  });

  bot.action(/notif_contato_1h_(.+)/, async (ctx) => {
    await processarNotificacaoContato(ctx, '1h', ctx.match[1]);
  });

  bot.action(/notif_contato_24h_(.+)/, async (ctx) => {
    await processarNotificacaoContato(ctx, '24h', ctx.match[1]);
  });

  bot.action(/notif_contato_3d_(.+)/, async (ctx) => {
    await processarNotificacaoContato(ctx, '3d', ctx.match[1]);
  });

  // ========================================================================
  // FUNÇÕES AUXILIARES
  // ========================================================================
  async function processarEstagio(ctx: any, estagio: string) {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      if (!telegramId) {
        return ctx.reply('Erro ao identificar usuário.');
      }

      // Buscar sessão atual
      const { data: session, error: sessionError } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (sessionError || !session) {
        return ctx.reply('Sessão não encontrada. Tente novamente.');
      }

      // Atualizar sessão
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
        return ctx.reply('Erro ao processar estágio.');
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
  }

  async function processarDataRapida(ctx: any, opcaoData: string) {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      if (!telegramId) {
        return ctx.reply('Erro ao identificar usuário.');
      }

      // Buscar sessão atual
      const { data: session, error: sessionError } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (sessionError || !session) {
        return ctx.reply('Sessão não encontrada. Tente novamente.');
      }

      // Calcular data baseada na opção
      let dataUTC: Date | null = null;
      let dataFormatada = 'Não definida';
      
      if (opcaoData !== 'pular') {
        let data: Date;
        const hoje = new Date();
        
        switch (opcaoData) {
          case 'hoje':
            data = hoje;
            break;
          case 'amanhã':
            data = new Date(hoje);
            data.setDate(data.getDate() + 1);
            break;
          case 'próxima semana':
            data = new Date(hoje);
            data.setDate(data.getDate() + 7);
            break;
          default:
            return ctx.reply('Opção inválida.');
        }

        // Converter para UTC e salvar
        dataUTC = new Date(data.getTime() + (3 * 60 * 60 * 1000));
        dataFormatada = data.toLocaleDateString('pt-BR');
      }
      
      // Atualizar sessão
      const { error: updateError } = await adminSupabase
        .from('sessions')
        .update({
          step: 'proxima_acao',
          data: { ...session.data, data_prevista: dataUTC?.toISOString() || null },
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      if (updateError) {
        console.error('Erro ao atualizar sessão:', updateError);
        return ctx.reply('Erro ao processar data.');
      }

      await ctx.reply(
        `✅ **Data prevista:** ${dataFormatada}\n\n` +
        `🎬 Digite a **próxima ação** a ser realizada:\n\n` +
        `Exemplos: "Agendar reunião", "Enviar proposta", "Fazer follow-up"`,
        { parse_mode: 'Markdown' }
      );

    } catch (error) {
      console.error('Erro ao processar data rápida:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  }

  // ========================================================================
  // 🔧 FUNÇÃO CORRIGIDA: PROCESSAR DATA DA PRÓXIMA AÇÃO
  // ========================================================================
  async function processarDataProximaAcao(ctx: any, opcaoData: string, followupId: string) {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      if (!telegramId) {
        return ctx.reply('Erro ao identificar usuário.');
      }

      // Buscar sessão atual
      const { data: session, error: sessionError } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

      if (sessionError || !session) {
        return ctx.reply('Sessão não encontrada. Tente novamente.');
      }

      // Calcular data baseada na opção
      let dataAcao: Date | null = null;
      let mensagemData = 'Não definida';
      
      if (opcaoData !== 'pular') {
        const hoje = new Date();
        
        switch (opcaoData) {
          case 'hoje':
            dataAcao = new Date(hoje);
            dataAcao.setHours(14, 0, 0, 0); // 14:00 por padrão
            break;
          case 'amanhã':
            dataAcao = new Date(hoje);
            dataAcao.setDate(dataAcao.getDate() + 1);
            dataAcao.setHours(14, 0, 0, 0);
            break;
          case 'esta semana':
            dataAcao = new Date(hoje);
            // Próxima sexta-feira
            const diasParaSexta = 5 - hoje.getDay();
            dataAcao.setDate(dataAcao.getDate() + (diasParaSexta > 0 ? diasParaSexta : 7));
            dataAcao.setHours(14, 0, 0, 0);
            break;
          case 'próxima semana':
            dataAcao = new Date(hoje);
            dataAcao.setDate(dataAcao.getDate() + 7);
            dataAcao.setHours(14, 0, 0, 0);
            break;
        }
        
        if (dataAcao) {
          mensagemData = format(dataAcao, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
        }
      }

      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);

      // ✅ CORREÇÃO: USAR session.data.proxima_acao corretamente
      const proximaAcao = session.data?.proxima_acao || 'Ação não definida';

      // Mostrar resumo final e perguntar sobre notificação
      await ctx.editMessageText(
        `📋 **RESUMO COMPLETO**\n\n` +
        `🎬 **Próxima ação:** ${proximaAcao}\n` +
        `📅 **Quando fazer:** ${mensagemData}\n\n` +
        `🔔 **Deseja configurar um lembrete?**`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('🔕 Não', `notif_contato_nao_${followupId}`),
              Markup.button.callback('⏰ 15 min antes', `notif_contato_15m_${followupId}`)
            ],
            [
              Markup.button.callback('⏰ 1 hora antes', `notif_contato_1h_${followupId}`),
              Markup.button.callback('📅 1 dia antes', `notif_contato_24h_${followupId}`)
            ]
          ])
        }
      );

    } catch (error) {
      console.error('Erro ao processar data da ação:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  }

  // ========================================================================
  // 🆕 FUNÇÃO PARA PROCESSAR NOTIFICAÇÃO DE CONTATO - MELHORADA
  // ========================================================================
  async function processarNotificacaoContato(ctx: any, tempo: string, followupId: string) {
    try {
      ctx.answerCbQuery();

      const tempoTexto = {
        '15m': '15 minutos',
        '1h': '1 hora',
        '24h': '24 horas', 
        '3d': '3 dias'
      }[tempo] || '24 horas';

      await ctx.editMessageText(
        `✅ **Contato registrado com sucesso!**\n\n` +
        `⏰ Lembrete configurado para **${tempoTexto}** antes da próxima ação.\n\n` +
        `🎯 Mantenha o follow-up sempre atualizado para melhores resultados!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('📋 Ver Histórico', `followup_historico_${followupId}`),
              Markup.button.callback('🔄 Ver Follow-ups', 'followup_listar_ativos')
            ],
            [
              Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
              Markup.button.callback('🏠 Menu Principal', 'menu_principal')
            ]
          ])
        }
      );

      console.log(`Notificação de contato configurada: ${tempo} para follow-up ${followupId}`);
      
    } catch (error) {
      console.error('Erro ao processar notificação de contato:', error);
      await ctx.reply('Ocorreu um erro ao configurar a notificação.');
    }
  }

  // ========================================================================
  // FUNÇÃO PARA PROCESSAR NOTIFICAÇÃO DE FOLLOWUP
  // ========================================================================
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

}