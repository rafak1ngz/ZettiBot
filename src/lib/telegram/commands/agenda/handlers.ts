import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================================================
// MENU PRINCIPAL
// ============================================================================
export async function handleAgenda(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  return ctx.reply(`
Gerenciamento de Agenda ZettiBot 📅

O que deseja fazer?
  `, 
  Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
      Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
    ],
    [
      Markup.button.callback('🏠 Menu Principal', 'menu_principal')
    ]
  ]));
}

// ============================================================================
// CRIAR NOVO COMPROMISSO
// ============================================================================
export async function handleNovoCompromisso(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    await ctx.editMessageText('Deseja vincular este compromisso a um cliente?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('👥 Sim, vincular cliente', 'agenda_vincular_cliente'),
          Markup.button.callback('➡️ Não precisa', 'agenda_sem_cliente')
        ],
        [
          Markup.button.callback('❌ Cancelar', 'cancelar_acao')
        ]
      ])
    );
  } catch (error) {
    console.error('Erro ao iniciar novo compromisso:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// VINCULAR CLIENTE
// ============================================================================
export async function handleVincularCliente(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;
    
    if (!telegramId || !userId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }
    
    // Criar sessão para busca de cliente
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);
      
    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'agenda',
        step: 'busca_cliente',
        data: {},
        updated_at: new Date().toISOString()
      }]);
      
    await ctx.editMessageText('Digite o nome ou parte do nome do cliente que deseja buscar:');
  } catch (error) {
    console.error('Erro ao iniciar busca de cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// COMPROMISSO SEM CLIENTE
// ============================================================================
export async function handleSemCliente(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;

    if (!telegramId || !userId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Criar sessão para compromisso sem cliente
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'agenda',
        step: 'titulo_compromisso',
        data: { cliente_id: null },
        updated_at: new Date().toISOString()
      }]);

    await ctx.editMessageText('Digite o título do compromisso:');
  } catch (error) {
    console.error('Erro ao processar compromisso sem cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// SELECIONAR CLIENTE ESPECÍFICO
// ============================================================================
export async function handleSelecionarCliente(ctx: Context, clienteId: string) {
  try {
    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;

    if (!telegramId || !userId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Verificar se o cliente existe
    const { data: cliente, error } = await adminSupabase
      .from('clientes')
      .select('nome_empresa')
      .eq('id', clienteId)
      .eq('user_id', userId)
      .single();

    if (error || !cliente) {
      return ctx.reply('Cliente não encontrado ou você não tem permissão para acessá-lo.');
    }

    // Criar sessão para compromisso com cliente
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'agenda',
        step: 'titulo_compromisso',
        data: { cliente_id: clienteId, nome_cliente: cliente.nome_empresa },
        updated_at: new Date().toISOString()
      }]);

    await ctx.editMessageText(`Cliente selecionado: ${cliente.nome_empresa}\n\nDigite o título do compromisso:`);
  } catch (error) {
    console.error('Erro ao selecionar cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR COMPROMISSOS
// ============================================================================
export async function handleListarCompromissos(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // ✅ LOADING STATE
    const loadingMsg = await ctx.reply('⏳ Buscando seus compromissos...');

    // ✅ CORREÇÃO: Buscar TODOS os compromissos pendentes (sem limit)
    const { data: compromissos, error } = await adminSupabase
      .from('compromissos')
      .select(`
        id,
        titulo,
        descricao,
        data_compromisso,
        local,
        status,
        clientes (nome_empresa)
      `)
      .eq('user_id', userId)
      .eq('status', 'pendente')
      .order('data_compromisso', { ascending: true });
      // ✅ REMOVIDO: .limit(5)

    if (error) {
      await ctx.editMessageText('❌ Erro ao buscar compromissos. Tente novamente.');
      return;
    }

    if (!compromissos || compromissos.length === 0) {
      return ctx.editMessageText(
        'Você não possui compromissos pendentes.',
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Adicionar Compromisso', 'agenda_novo')],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    }

    // ✅ DELETAR mensagem de loading
    await ctx.deleteMessage(loadingMsg.message_id);

    // ✅ CORREÇÃO: Mostrar com paginação se tiver mais de 5
    await mostrarCompromissosPaginados(ctx, compromissos, 0);

  } catch (error) {
    console.error('Erro ao listar compromissos:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ✅ NOVA FUNÇÃO: Paginação de compromissos
async function mostrarCompromissosPaginados(ctx: Context, todosCompromissos: any[], pagina: number) {
  const compromissosPorPagina = 5;
  const inicio = pagina * compromissosPorPagina;
  const fim = inicio + compromissosPorPagina;
  const compromissosPagina = todosCompromissos.slice(inicio, fim);
  const totalPaginas = Math.ceil(todosCompromissos.length / compromissosPorPagina);

  // ✅ CABEÇALHO com contador
  await ctx.reply(`📅 Seus compromissos (${pagina + 1}/${totalPaginas}) - Total: ${todosCompromissos.length}`);

  // ✅ MOSTRAR compromissos da página atual
  for (const compromisso of compromissosPagina) {
    // ✅ CORREÇÃO: Converter UTC para Brasil na exibição
    const dataUTC = new Date(compromisso.data_compromisso);
    const dataBrasil = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
    const dataFormatada = format(dataBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    const clienteNome = compromisso.clientes ? compromisso.clientes.nome_empresa : 'Sem cliente';
    
    await ctx.reply(
      `📌 ${compromisso.titulo}\n` +
      `📆 ${dataFormatada}\n` +
      `👥 ${clienteNome}\n` +
      (compromisso.local ? `📍 ${compromisso.local}\n` : '') +
      (compromisso.descricao ? `📝 ${compromisso.descricao}` : ''),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✏️ Editar', `agenda_editar_${compromisso.id}`),
          Markup.button.callback('✅ Concluído', `agenda_concluir_${compromisso.id}`),
          Markup.button.callback('❌ Cancelar', `agenda_cancelar_${compromisso.id}`)
        ]
      ])
    );
  }

  // ✅ BOTÕES de navegação
  const botoesNavegacao = [];
  
  // Botões de paginação
  const botoesPaginacao = [];
  if (pagina > 0) {
    botoesPaginacao.push(Markup.button.callback('⬅️ Anterior', `agenda_pagina_${pagina - 1}`));
  }
  if (pagina < totalPaginas - 1) {
    botoesPaginacao.push(Markup.button.callback('➡️ Próxima', `agenda_pagina_${pagina + 1}`));
  }
  
  if (botoesPaginacao.length > 0) {
    botoesNavegacao.push(botoesPaginacao);
  }

  // Botões de ação
  botoesNavegacao.push([
    Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
    Markup.button.callback('🏠 Menu Principal', 'menu_principal')
  ]);

  await ctx.reply(
    'O que deseja fazer?',
    Markup.inlineKeyboard(botoesNavegacao)
  );
}


// ============================================================================
// EDITAR COMPROMISSO EXISTENTE
// ============================================================================
export async function handleEditarCompromisso(ctx: Context, compromissoId: string) {
  try {
    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;
    
    if (!telegramId || !userId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Buscar o compromisso
    const { data: compromisso, error } = await adminSupabase
      .from('compromissos')
      .select(`
        *,
        clientes (nome_empresa)
      `)
      .eq('id', compromissoId)
      .eq('user_id', userId)
      .single();
    
    if (error || !compromisso) {
      console.error('Erro ao buscar compromisso:', error);
      await ctx.reply('Compromisso não encontrado.');
      return;
    }
    
    // Armazenar dados do compromisso em sessão
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);
      
    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'agenda',
        step: 'editar_compromisso',
        data: {
          id: compromisso.id,
          titulo: compromisso.titulo,
          descricao: compromisso.descricao,
          data_compromisso: compromisso.data_compromisso,
          local: compromisso.local,
          cliente_id: compromisso.cliente_id,
          nome_cliente: compromisso.clientes?.nome_empresa || null
        },
        updated_at: new Date().toISOString()
      }]);
    
    // Mostrar opções de edição
    await ctx.reply(
      `O que você deseja editar no compromisso "${compromisso.titulo}"?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('📝 Título', 'agenda_edit_titulo')],
        [Markup.button.callback('📄 Descrição', 'agenda_edit_descricao')],
        [Markup.button.callback('📅 Data', 'agenda_edit_data')],
        [Markup.button.callback('🕐 Hora', 'agenda_edit_hora')],
        [Markup.button.callback('📍 Local', 'agenda_edit_local')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );
  } catch (error) {
    console.error('Erro ao iniciar edição:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

// Mostrar confirmação de edição com botão de salvar
export async function mostrarConfirmacaoEdicao(ctx: Context, compromissoData: any) {
  try {
    const dataFormatada = format(new Date(compromissoData.data_compromisso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const clienteInfo = compromissoData.nome_cliente 
      ? `Cliente: ${compromissoData.nome_cliente}\n`
      : '';
      
    await ctx.reply(
      `📋 Confirme as alterações do compromisso:\n\n` +
      `Título: ${compromissoData.titulo}\n` +
      `${clienteInfo}` +
      `Data: ${dataFormatada}\n` +
      (compromissoData.local ? `Local: ${compromissoData.local}\n` : '') +
      (compromissoData.descricao ? `Descrição: ${compromissoData.descricao}\n` : '') +
      `\nDeseja salvar as alterações?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Salvar Alterações', 'agenda_salvar_edicao'),
          Markup.button.callback('✏️ Continuar Editando', 'agenda_continuar_editando')
        ],
        [
          Markup.button.callback('❌ Cancelar', 'cancelar_acao')
        ]
      ])
    );
  } catch (error) {
    console.error('Erro ao mostrar confirmação:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

export { mostrarCompromissosPaginados };