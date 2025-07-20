import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utcParaBrasil } from '@/utils/timezone';

// ============================================================================
// MENU PRINCIPAL DE LEMBRETES
// ============================================================================
export async function handleLembretes(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  return ctx.reply(`
Gerenciamento de Lembretes ZettiBot 🔔

O que deseja fazer?
  `, 
  Markup.inlineKeyboard([
    [
      Markup.button.callback('🆕 Criar Lembrete', 'lembrete_criar'),
      Markup.button.callback('📋 Listar Lembretes', 'lembrete_listar')
    ],
    [
      Markup.button.callback('🏠 Menu Principal', 'menu_principal')
    ]
  ]));
}

// ============================================================================
// CRIAR NOVO LEMBRETE
// ============================================================================
export async function handleNovoLembrete(ctx: Context) {
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

    // Criar nova sessão para lembrete
    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'lembretes',
        step: 'titulo_lembrete',
        data: {},
        updated_at: new Date().toISOString()
      }]);

    await ctx.editMessageText('📝 Vamos criar um novo lembrete!\n\nDigite o título do lembrete:\n\nExemplos: "Ligar para Cliente X", "Enviar proposta", "Cobrar pagamento"');
  } catch (error) {
    console.error('Erro ao iniciar novo lembrete:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR LEMBRETES
// ============================================================================
export async function handleListarLembretes(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Loading state
    const loadingMsg = await ctx.reply('⏳ Buscando seus lembretes...');

    // Buscar lembretes pendentes
    const { data: lembretes, error } = await adminSupabase
      .from('lembretes')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pendente')
      .order('data_lembrete', { ascending: true });

    if (error) {
      await ctx.editMessageText('❌ Erro ao buscar lembretes. Tente novamente.');
      return;
    }

    if (!lembretes || lembretes.length === 0) {
      return ctx.editMessageText(
        'Você não possui lembretes pendentes.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🆕 Criar Lembrete', 'lembrete_criar')],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    }

    // Deletar mensagem de loading
    await ctx.deleteMessage(loadingMsg.message_id);

    // Mostrar lembretes com paginação se necessário
    await mostrarLembretesPaginados(ctx, lembretes, 0);

  } catch (error) {
    console.error('Erro ao listar lembretes:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// PAGINAÇÃO DE LEMBRETES - VERSÃO CORRIGIDA
// ============================================================================
async function mostrarLembretesPaginados(ctx: Context, todosLembretes: any[], pagina: number) {
  const lembretesPorPagina = 5;
  const inicio = pagina * lembretesPorPagina;
  const fim = inicio + lembretesPorPagina;
  const lembretesPagina = todosLembretes.slice(inicio, fim);
  const totalPaginas = Math.ceil(todosLembretes.length / lembretesPorPagina);

  // Cabeçalho com contador
  await ctx.reply(`🔔 Seus Lembretes (${pagina + 1}/${totalPaginas}) - Total: ${todosLembretes.length}`);

  // Mostrar lembretes da página atual
  for (const lembrete of lembretesPagina) {
    // Converter UTC para Brasil na exibição
    const dataUTC = new Date(lembrete.data_lembrete);
    const dataBrasil = utcParaBrasil(dataUTC);
    const dataFormatada = format(dataBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    // 🔥 CORREÇÃO: Emoji de prioridade com cast de tipo
    const prioridade = lembrete.prioridade as 'alta' | 'media' | 'baixa';
    const emojiPrioridade = {
      alta: '🔴',
      media: '🟡',
      baixa: '🔵'
    }[prioridade] || '⚪';

    const textoPrioridade = {
      alta: 'Alta',
      media: 'Média', 
      baixa: 'Baixa'
    }[prioridade] || 'Normal';
    
    await ctx.reply(
      `${emojiPrioridade} **${lembrete.titulo}**\n` +
      `📅 ${dataFormatada}\n` +
      `🎯 Prioridade: ${textoPrioridade}\n` +
      (lembrete.descricao ? `📝 ${lembrete.descricao}` : ''),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('✏️ Editar', `lembrete_editar_${lembrete.id}`),
            Markup.button.callback('✅ Concluir', `lembrete_concluir_${lembrete.id}`),
            Markup.button.callback('🗑️ Excluir', `lembrete_excluir_${lembrete.id}`)
          ]
        ])
      }
    );
  }

  // Botões de navegação
  const botoesNavegacao = [];
  
  // Botões de paginação
  const botoesPaginacao = [];
  if (pagina > 0) {
    botoesPaginacao.push(Markup.button.callback('⬅️ Anterior', `lembrete_pagina_${pagina - 1}`));
  }
  if (pagina < totalPaginas - 1) {
    botoesPaginacao.push(Markup.button.callback('➡️ Próxima', `lembrete_pagina_${pagina + 1}`));
  }
  
  if (botoesPaginacao.length > 0) {
    botoesNavegacao.push(botoesPaginacao);
  }

  // Botões de ação
  botoesNavegacao.push([
    Markup.button.callback('🆕 Novo Lembrete', 'lembrete_criar'),
    Markup.button.callback('🏠 Menu Principal', 'menu_principal')
  ]);

  await ctx.reply(
    'O que deseja fazer?',
    Markup.inlineKeyboard(botoesNavegacao)
  );
}

// ============================================================================
// CONCLUIR LEMBRETE
// ============================================================================
export async function handleConcluirLembrete(ctx: Context, lembreteId: string) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Atualizar status do lembrete
    const { error } = await adminSupabase
      .from('lembretes')
      .update({
        status: 'concluido',
        updated_at: new Date().toISOString()
      })
      .eq('id', lembreteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao concluir lembrete:', error);
      await ctx.reply('Erro ao concluir lembrete. Por favor, tente novamente.');
      return;
    }

    await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    await ctx.reply('✅ Lembrete concluído com sucesso!\n\n🎉 Parabéns! Mais uma tarefa finalizada.');

    return handleListarLembretes(ctx);
  } catch (error) {
    console.error('Erro ao concluir lembrete:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

export { mostrarLembretesPaginados };