import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

export async function handleNovoCompromisso(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Verificar se deseja vincular a um cliente
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

export async function handleVincularCliente(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Buscar lista de clientes
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('id, nome_empresa')
      .eq('user_id', userId)
      .order('nome_empresa', { ascending: true })
      .limit(10);

    if (error || !clientes || clientes.length === 0) {
      await ctx.reply('Você não possui clientes cadastrados ou houve um erro na busca.');
      return handleNovoCompromisso(ctx);
    }

    // Criar botões para clientes
    const clientesButtons = clientes.map(cliente => 
      [Markup.button.callback(cliente.nome_empresa, `agenda_cliente_${cliente.id}`)]
    );

    // Adicionar opção de cancelar
    clientesButtons.push([Markup.button.callback('❌ Cancelar', 'cancelar_acao')]);

    await ctx.editMessageText(
      'Escolha um cliente para vincular ao compromisso:',
      { reply_markup: { inline_keyboard: clientesButtons } }
    );
  } catch (error) {
    console.error('Erro ao vincular cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

export async function handleSemCliente(ctx: Context) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Criar sessão para registrar compromisso sem cliente
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    await adminSupabase
      .from('sessions')
      .insert([
        {
          telegram_id: telegramId,
          user_id: userId,
          command: 'agenda',
          step: 'titulo_compromisso',
          data: { cliente_id: null },
          updated_at: new Date().toISOString()
        }
      ]);

    // Solicitar título do compromisso
    await ctx.editMessageText('Digite o título do compromisso:');
  } catch (error) {
    console.error('Erro ao processar compromisso sem cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

export async function handleSelecionarCliente(ctx: Context, clienteId: string) {
  try {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
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

    // Criar sessão para registrar compromisso com cliente
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    await adminSupabase
      .from('sessions')
      .insert([
        {
          telegram_id: telegramId,
          user_id: userId,
          command: 'agenda',
          step: 'titulo_compromisso',
          data: { cliente_id: clienteId, nome_cliente: cliente.nome_empresa },
          updated_at: new Date().toISOString()
        }
      ]);

    // Solicitar título do compromisso
    await ctx.editMessageText(`Cliente selecionado: ${cliente.nome_empresa}\n\nDigite o título do compromisso:`);
  } catch (error) {
    console.error('Erro ao selecionar cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

export async function handleListarCompromissos(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    // Buscar compromissos pendentes
    const { data: compromissos, error } = await adminSupabase
      .from('compromissos')
      .select(`
        *,
        clientes (nome_empresa)
      `)
      .eq('user_id', userId)
      .eq('status', 'pendente')
      .order('data_compromisso', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Erro ao buscar compromissos:', error);
      return ctx.reply('Ocorreu um erro ao buscar os compromissos.');
    }

    if (!compromissos || compromissos.length === 0) {
      return ctx.reply(
        'Você não possui compromissos pendentes.',
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Adicionar Compromisso', 'agenda_novo')],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    }

    // Mostrar lista de compromissos
    await ctx.reply('📅 Seus próximos compromissos:');

    for (const compromisso of compromissos) {
      const data = new Date(compromisso.data_compromisso);
      const dataFormatada = format(data, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
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
            Markup.button.callback('🗑️ Excluir', `agenda_excluir_${compromisso.id}`)
          ]
        ])
      );
    }

    await ctx.reply(
      'O que deseja fazer?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
          Markup.button.callback('🏠 Menu Principal', 'menu_principal')
        ]
      ])
    );
  } catch (error) {
    console.error('Erro ao listar compromissos:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}