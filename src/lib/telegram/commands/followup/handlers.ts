import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utcParaBrasil } from '@/utils/timezone';
import { EstagioFollowup, StatusFollowup } from '@/types/database';

// ============================================================================
// MENU PRINCIPAL DE FOLLOWUP
// ============================================================================
export async function handleFollowup(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  // Buscar estatísticas rápidas
  const { data: stats } = await adminSupabase
    .from('followups')
    .select('status')
    .eq('user_id', userId);

  const ativos = stats?.filter(f => f.status === 'ativo').length || 0;
  const ganhos = stats?.filter(f => f.status === 'ganho').length || 0;
  const perdidos = stats?.filter(f => f.status === 'perdido').length || 0;

  return ctx.reply(`
📊 Follow-up ZettiBot 

📈 Seus números:
🔄 Ativos: ${ativos}
✅ Ganhos: ${ganhos} 
❌ Perdidos: ${perdidos}

O que deseja fazer?
  `, 
  Markup.inlineKeyboard([
    [
      Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
      Markup.button.callback('📋 Listar Follow-ups', 'followup_listar')
    ],
    [
      Markup.button.callback('🏠 Menu Principal', 'menu_principal')
    ]
  ]));
}

// ============================================================================
// CRIAR NOVO FOLLOWUP
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
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    // Criar nova sessão para followup
    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'escolher_cliente',
        data: {},
        updated_at: new Date().toISOString()
      }]);

    await ctx.editMessageText(`
🆕 Novo Follow-up

Como deseja proceder?
    `,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Buscar Cliente Existente', 'followup_buscar_cliente')],
      [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
      [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
    ]));
  } catch (error) {
    console.error('Erro ao iniciar novo followup:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR FOLLOWUPS
// ============================================================================
export async function handleListarFollowups(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    await ctx.editMessageText(`
📋 Listar Follow-ups

Que tipo deseja visualizar?
    `,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Ativos', 'followup_listar_ativos')],
      [
        Markup.button.callback('✅ Ganhos', 'followup_listar_ganhos'),
        Markup.button.callback('❌ Perdidos', 'followup_listar_perdidos')
      ],
      [Markup.button.callback('🔙 Voltar', 'menu_followup')],
      [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
    ]));
  } catch (error) {
    console.error('Erro ao listar followups:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR FOLLOWUPS POR STATUS
// ============================================================================
export async function listarFollowupsPorStatus(ctx: Context, status: StatusFollowup) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Loading state
    const loadingMsg = await ctx.reply('⏳ Buscando seus follow-ups...');

    // Buscar followups por status
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

    if (error) {
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply('❌ Erro ao buscar follow-ups. Tente novamente.');
      return;
    }

    if (!followups || followups.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      
      const statusTexto = {
        'ativo': 'ativos',
        'ganho': 'ganhos', 
        'perdido': 'perdidos'
      }[status];

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

  const statusTexto = {
    'ativo': '🔄 Ativos',
    'ganho': '✅ Ganhos', 
    'perdido': '❌ Perdidos'
  }[status];

  // Cabeçalho com contador
  await ctx.reply(`${statusTexto} (${pagina + 1}/${totalPaginas}) - Total: ${todosFollowups.length}`);

  // Mostrar followups da página atual
  for (const followup of followupsPagina) {
    const cliente = followup.clientes;
    const nomeCliente = cliente?.nome_empresa || 'Cliente não encontrado';
    const nomeContato = cliente?.contato_nome ? ` - ${cliente.contato_nome}` : '';
    
    // Emojis por estágio
    const estagioEmoji = {
      'prospeccao': '🔍',
      'apresentacao': '📋',
      'proposta': '💰',
      'negociacao': '🤝',
      'fechamento': '✅'
    }[followup.estagio] || '📊';

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

    // Criar sessão para registrar contato
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'registrar_contato',
        data: followup,
        updated_at: new Date().toISOString()
      }]);

    const ultimoContatoUTC = new Date(followup.ultimo_contato);
    const ultimoContatoBrasil = utcParaBrasil(ultimoContatoUTC);
    const ultimoContatoTexto = format(ultimoContatoBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

    await ctx.reply(
      `📞 **${followup.clientes?.nome_empresa}** - ${followup.clientes?.contato_nome || 'Contato'}\n\n` +
      `🕐 Último contato: ${ultimoContatoTexto}\n\n` +
      `Digite o resumo do contato realizado:`,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Erro ao iniciar registro de contato:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}