// ============================================================================
// HANDLERS DO MÓDULO FOLLOWUP - VERSÃO CORRIGIDA
// ============================================================================

import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { adminSupabase } from '../../../db/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utcParaBrasil } from '../../utils/dateUtils';
import { 
  EstagioFollowup, 
  StatusFollowup, 
  getEstagioEmoji, 
  getEstagioTexto, 
  getStatusTexto,
  isValidStatus 
} from './types';

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
    return false;
  }
}

// ============================================================================
// NOVO FOLLOWUP
// ============================================================================
export async function handleNovoFollowup(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;

    if (!userId || !telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Limpar sessões anteriores
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId)
      .eq('type', 'followup');

    // Buscar clientes
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('id, nome_empresa, contato_nome')
      .eq('user_id', userId)
      .order('nome_empresa');

    if (error) {
      console.error('Erro ao buscar clientes:', error);
      return ctx.reply('Erro ao buscar clientes.');
    }

    if (!clientes || clientes.length === 0) {
      return ctx.reply(
        'Você ainda não possui clientes cadastrados.\n\n' +
        'Para criar um follow-up, primeiro cadastre um cliente.',
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Cadastrar Cliente', 'clientes_adicionar')],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    }

    await ctx.reply(
      '🔍 **Selecione um cliente** para criar o follow-up:\n\n' +
      'Digite parte do nome da empresa para buscar:',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      }
    );

    // Criar sessão
    await adminSupabase
      .from('sessions')
      .insert({
        telegram_id: telegramId,
        user_id: userId,
        type: 'followup',
        step: 'buscar_cliente',
        data: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    return true;
  } catch (error) {
    console.error('Erro ao iniciar novo followup:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente.');
    return false;
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
        `Você não possui follow-ups ${statusTexto}.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🆕 Criar Follow-up', 'followup_novo')],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
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
// PAGINAÇÃO DE FOLLOWUPS
// ============================================================================
export async function mostrarFollowupsPaginados(ctx: Context, todosFollowups: any[], pagina: number, status: StatusFollowup) {
  const followupsPorPagina = 3; // Menos por página pois tem mais info
  const inicio = pagina * followupsPorPagina;
  const fim = inicio + followupsPorPagina;
  const followupsPagina = todosFollowups.slice(inicio, fim);
  const totalPaginas = Math.ceil(todosFollowups.length / followupsPorPagina);

  const statusTexto = getStatusTexto(status);

  // Cabeçalho com contador
  await ctx.reply(`${statusTexto} (${pagina + 1}/${totalPaginas}) - Total: ${todosFollowups.length}`);

  // Mostrar followups da página atual
  for (const followup of followupsPagina) {
    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    const nomeCliente = cliente?.nome_empresa || 'Cliente não encontrado';
    const nomeContato = cliente?.contato_nome ? ` - ${cliente.contato_nome}` : '';
    
    // Emoji do estágio usando função segura
    const estagioEmoji = getEstagioEmoji(followup.estagio);

    // Formatação de valor
    const valorTexto = followup.valor_estimado 
      ? `💰 R$ ${new Intl.NumberFormat('pt-BR').format(followup.valor_estimado)}`
      : '💰 Valor não informado';

    // Data de previsão
    let previsaoTexto = '';
    if (followup.data_prevista) {
      const dataPrevisaoUTC = new Date(followup.data_prevista);
      const dataPrevisaoBrasil = utcParaBrasil(dataPrevisaoUTC);
      previsaoTexto = `\n📅 Previsão: ${format(dataPrevisaoBrasil, 'dd/MM/yyyy', { locale: ptBR })}`;
    }

    // Último contato
    const ultimoContatoUTC = new Date(followup.ultimo_contato);
    const ultimoContatoBrasil = utcParaBrasil(ultimoContatoUTC);
    const ultimoContatoTexto = `\n🕐 Último contato: ${format(ultimoContatoBrasil, 'dd/MM/yyyy', { locale: ptBR })}`;

    // Próxima ação
    const proximaAcaoTexto = followup.proxima_acao 
      ? `\n🎬 ${followup.proxima_acao}`
      : '';

    let botoes = [];
    
    if (status === 'ativo') {
      // Botões para followups ativos
      botoes = [
        [
          Markup.button.callback('📞 Contato', `followup_contato_${followup.id}`),
          Markup.button.callback('✏️ Editar', `followup_editar_${followup.id}`)
        ],
        [
          Markup.button.callback('✅ Ganhou', `followup_ganho_${followup.id}`),
          Markup.button.callback('❌ Perdeu', `followup_perdido_${followup.id}`)
        ]
      ];
    } else {
      // Botões para followups finalizados
      botoes = [
        [Markup.button.callback('👁️ Ver Detalhes', `followup_detalhes_${followup.id}`)]
      ];
    }
    
    await ctx.reply(
      `${estagioEmoji} **${followup.titulo}**\n` +
      `🏢 ${nomeCliente}${nomeContato}\n` +
      `${valorTexto}${previsaoTexto}${ultimoContatoTexto}${proximaAcaoTexto}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(botoes)
      }
    );
  }

  // Botões de navegação
  const botoesNavegacao = [];
  
  // Botões de paginação
  const botoesPaginacao = [];
  if (pagina > 0) {
    botoesPaginacao.push(Markup.button.callback('⬅️ Anterior', `followup_pagina_${status}_${pagina - 1}`));
  }
  if (pagina < totalPaginas - 1) {
    botoesPaginacao.push(Markup.button.callback('➡️ Próxima', `followup_pagina_${status}_${pagina + 1}`));
  }
  
  if (botoesPaginacao.length > 0) {
    botoesNavegacao.push(botoesPaginacao);
  }

  // Botões de ação
  if (status === 'ativo') {
    botoesNavegacao.push([
      Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
      Markup.button.callback('📊 Follow-up Menu', 'menu_followup')
    ]);
  } else {
    botoesNavegacao.push([
      Markup.button.callback('📊 Follow-up Menu', 'menu_followup'),
      Markup.button.callback('🏠 Menu Principal', 'menu_principal')
    ]);
  }

  await ctx.reply(
    'O que deseja fazer?',
    Markup.inlineKeyboard(botoesNavegacao)
  );
}

// ============================================================================
// REGISTRAR CONTATO
// ============================================================================
export async function handleRegistrarContato(ctx: Context, followupId: string) {
  try {
    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;
    
    if (!userId || !telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Buscar dados do followup
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
      console.error('Erro ao buscar followup:', error);
      await ctx.reply('Follow-up não encontrado.');
      return;
    }

    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    const nomeCliente = cliente?.nome_empresa || 'Cliente não encontrado';
    const nomeContato = cliente?.contato_nome ? ` - ${cliente.contato_nome}` : '';
    
    // Usar função segura para obter emoji e texto do estágio
    const estagioEmoji = getEstagioEmoji(followup.estagio);
    const estagioTexto = getEstagioTexto(followup.estagio);

    await ctx.reply(
      `📞 **Registrar Contato**\n\n` +
      `${estagioEmoji} **${followup.titulo}**\n` +
      `🏢 ${nomeCliente}${nomeContato}\n\n` +
      `📝 Digite suas **observações** sobre este contato:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      }
    );

    // Limpar sessões anteriores e criar nova
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId)
      .eq('type', 'followup_contato');

    await adminSupabase
      .from('sessions')
      .insert({
        telegram_id: telegramId,
        user_id: userId,
        type: 'followup_contato',
        step: 'observacoes',
        data: { followup_id: followupId },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

  } catch (error) {
    console.error('Erro ao registrar contato:', error);
    await ctx.reply('Ocorreu um erro. Tente novamente.');
  }
}