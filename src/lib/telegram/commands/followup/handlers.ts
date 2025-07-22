// ============================================================================
// HANDLERS DO MÓDULO FOLLOWUP - VERSÃO FINAL CORRIGIDA
// ============================================================================

import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utcParaBrasil } from '@/utils/timezone';
import { 
  EstagioFollowup, 
  StatusFollowup, 
  getEstagioEmoji, 
  getEstagioTexto, 
  getStatusTexto,
  isValidStatus 
} from './types';

// ============================================================================
// UTILITÁRIO PARA FORMATAÇÃO SEGURA DE DATA
// ============================================================================
function formatarDataSegura(dataString: any): string {
  if (!dataString) return 'Não definida';
  
  try {
    const dataUTC = typeof dataString === 'string' ? new Date(dataString) : dataString;
    
    // Verificar se é uma data válida
    if (!(dataUTC instanceof Date) || !dataUTC.getTime || isNaN(dataUTC.getTime())) {
      return 'Data inválida';
    }
    
    return format(utcParaBrasil(dataUTC), 'dd/MM/yyyy', { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Erro na data';
  }
}

// ============================================================================
// MENU PRINCIPAL DO FOLLOWUP
// ============================================================================
export async function handleFollowup(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado. Use /inicio para registrar-se.');
    }

    // Buscar estatísticas
    const { data: followups, error } = await adminSupabase
      .from('followups')
      .select('status, valor_estimado')
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return ctx.reply('Erro ao carregar estatísticas.');
    }

    // Calcular estatísticas
    const ativos = followups?.filter(f => f.status === 'ativo').length || 0;
    const ganhos = followups?.filter(f => f.status === 'ganho').length || 0;
    const perdidos = followups?.filter(f => f.status === 'perdido').length || 0;
    
    const valorTotal = followups
      ?.filter(f => f.status === 'ativo' && f.valor_estimado)
      .reduce((acc, f) => acc + f.valor_estimado, 0) || 0;

    const valorFormatado = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valorTotal);

    const mensagem = `📊 **Painel Follow-up**\n\n` +
      `🔄 **Ativos:** ${ativos}\n` +
      `✅ **Ganhos:** ${ganhos}\n` +
      `❌ **Perdidos:** ${perdidos}\n\n` +
      `💰 **Pipeline Total:** ${valorFormatado}`;

    await ctx.reply(mensagem, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
          Markup.button.callback('🔄 Ver Ativos', 'followup_listar_ativos')
        ],
        [
          Markup.button.callback('✅ Ver Ganhos', 'followup_listar_ganhos'),
          Markup.button.callback('❌ Ver Perdidos', 'followup_listar_perdidos')
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    });

    return true;
  } catch (error) {
    console.error('Erro no menu followup:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente.');
  }
}

// ============================================================================
// NOVO FOLLOWUP
// ============================================================================
export async function handleNovoFollowup(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Limpar sessões existentes
    const { error: deleteError } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (deleteError) {
      console.error('Erro ao limpar sessão:', deleteError);
    }

    // Criar nova sessão para followup
    const { error: insertError } = await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'escolher_cliente',
        data: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (insertError) {
      console.error('Erro ao criar sessão:', insertError);
      return ctx.reply('Erro ao iniciar processo. Tente novamente.');
    }

    await ctx.editMessageText(`🆕 **Novo Follow-up**

Como deseja proceder?`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Buscar Cliente Existente', 'followup_buscar_cliente')],
        [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    });
    
  } catch (error) {
    console.error('Erro em handleNovoFollowup:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR FOLLOWUPS POR STATUS
// ============================================================================
export async function handleListarFollowups(ctx: Context, status: StatusFollowup) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Validar status
    if (!isValidStatus(status)) {
      return ctx.reply('Status inválido.');
    }

    // Mostrar loading
    const loadingMsg = await ctx.reply('🔄 Carregando follow-ups...');

    // Buscar followups
    const { data: followups, error } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar followups:', error);
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply('Erro ao buscar follow-ups. Tente novamente.');
      return;
    }

    if (!followups || followups.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      
      const statusTexto = getStatusTexto(status).toLowerCase();

      return ctx.reply(
        `Você não possui follow-ups ${statusTexto}.`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Criar Follow-up', 'followup_novo')],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );
    }

    // Deletar mensagem de loading
    await ctx.deleteMessage(loadingMsg.message_id);

    // Mostrar followups com paginação
    await mostrarFollowupsPaginados(ctx, followups, 0, status);

  } catch (error) {
    console.error('Erro ao listar followups por status:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// PAGINAÇÃO DE FOLLOWUPS - VERSÃO ROBUSTA CORRIGIDA
// ============================================================================
export async function mostrarFollowupsPaginados(ctx: Context, todosFollowups: any[], pagina: number, status: StatusFollowup) {
  try {
    const followupsPorPagina = 3;
    const inicio = pagina * followupsPorPagina;
    const fim = inicio + followupsPorPagina;
    const followupsPagina = todosFollowups.slice(inicio, fim);
    const totalPaginas = Math.ceil(todosFollowups.length / followupsPorPagina);

    const statusTexto = getStatusTexto(status);

    // Cabeçalho com contador
    await ctx.reply(`**${statusTexto}** (${pagina + 1}/${totalPaginas}) - Total: ${todosFollowups.length}`, {
      parse_mode: 'Markdown'
    });

    // Mostrar followups da página atual
    for (const followup of followupsPagina) {
      try {
        // ✅ CORRIGIDO: Verificar se clientes é array ou objeto
        const cliente = Array.isArray(followup.clientes) 
          ? followup.clientes[0] 
          : followup.clientes;

        const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';
        const nomeContato = cliente?.contato_nome || 'Contato não informado';
        
        const valorFormatado = followup.valor_estimado 
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(followup.valor_estimado)
          : 'Não informado';
          
        // ✅ CORRIGIDO: Usar função segura para formatar data
        const dataFormatada = formatarDataSegura(followup.data_prevista);

        const mensagemFollowup = `**${followup.titulo}**\n\n` +
          `🏢 **Cliente:** ${nomeEmpresa}\n` +
          `👤 **Contato:** ${nomeContato}\n` +
          `${getEstagioEmoji(followup.estagio)} **Estágio:** ${getEstagioTexto(followup.estagio)}\n` +
          `💰 **Valor:** ${valorFormatado}\n` +
          `📅 **Previsão:** ${dataFormatada}\n` +
          `📝 **Próxima Ação:** ${followup.proxima_acao || 'Não definida'}`;

        const botoes = [];
        
        // Botões específicos por status
        if (status === 'ativo') {
          botoes.push([
            Markup.button.callback('📞 Registrar Contato', `followup_contato_${followup.id}`),
            Markup.button.callback('✏️ Editar', `followup_editar_${followup.id}`)
          ]);
          botoes.push([
            Markup.button.callback('✅ Marcar como Ganho', `followup_ganho_${followup.id}`),
            Markup.button.callback('❌ Marcar como Perdido', `followup_perdido_${followup.id}`)
          ]);
        } else {
          botoes.push([
            Markup.button.callback('📋 Ver Detalhes', `followup_detalhes_${followup.id}`)
          ]);
        }

        await ctx.reply(mensagemFollowup, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(botoes)
        });
      } catch (itemError) {
        console.error('Erro ao processar item de followup:', itemError);
        await ctx.reply(`❌ Erro ao exibir follow-up: ${followup.titulo || 'Sem título'}`);
      }
    }

    // Botões de navegação
    const botoesNavegacao = [];
    
    if (totalPaginas > 1) {
      const navButtons = [];
      
      if (pagina > 0) {
        navButtons.push(Markup.button.callback('⬅️ Anterior', `followup_pagina_${status}_${pagina - 1}`));
      }
      
      if (pagina < totalPaginas - 1) {
        navButtons.push(Markup.button.callback('➡️ Próxima', `followup_pagina_${status}_${pagina + 1}`));
      }
      
      if (navButtons.length > 0) {
        botoesNavegacao.push(navButtons);
      }
    }

    botoesNavegacao.push([
      Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
      Markup.button.callback('📊 Follow-up Menu', 'menu_followup')
    ]);
    botoesNavegacao.push([Markup.button.callback('🏠 Menu Principal', 'menu_principal')]);

    await ctx.reply('📍 **Navegação:**', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(botoesNavegacao)
    });

  } catch (error) {
    console.error('Erro na paginação de followups:', error);
    await ctx.reply('Erro ao exibir followups. Tente novamente.');
  }
}

// ============================================================================
// REGISTRAR CONTATO
// ============================================================================
export async function handleRegistrarContato(ctx: Context, followupId: string) {
  try {
    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;
    
    if (!userId || !telegramId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Buscar followup
    const { data: followup, error } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', followupId)
      .eq('user_id', userId)
      .single();

    if (error || !followup) {
      return ctx.reply('Follow-up não encontrado.');
    }

    // Limpar sessão anterior
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    // Criar nova sessão
    const { error: sessionError } = await adminSupabase
      .from('sessions')
      .insert({
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'registrar_contato',
        data: { followup_id: followupId },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (sessionError) {
      console.error('Erro ao criar sessão:', sessionError);
      return ctx.reply('Erro ao iniciar registro de contato.');
    }

    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';

    await ctx.reply(
      `📞 **Registrar Contato**\n\n` +
      `**Follow-up:** ${followup.titulo}\n` +
      `**Cliente:** ${nomeEmpresa}\n\n` +
      `Descreva o contato realizado:`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Erro ao registrar contato:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}