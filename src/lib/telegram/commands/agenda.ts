import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { Compromisso } from '@/types/database';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export async function handleAgenda(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  return ctx.reply(`
Gerenciamento de Agenda ZettiBot 📅

O que deseja fazer?

1️⃣ Registrar novo compromisso
2️⃣ Visualizar compromissos
3️⃣ Editar compromisso
4️⃣ Excluir compromisso
  `, 
  Markup.inlineKeyboard([
    [
      Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
      Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
    ],
    [
      Markup.button.callback('✏️ Editar Compromisso', 'agenda_editar'),
      Markup.button.callback('🗑️ Excluir Compromisso', 'agenda_excluir')
    ]
  ]));
}

export async function handleNovoCompromisso(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  // Verificar se deseja vincular a um cliente
  await ctx.reply(
    'Deseja vincular este compromisso a um cliente?',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('👥 Sim, vincular cliente', 'agenda_vincular_cliente'),
        Markup.button.callback('➡️ Pular', 'agenda_sem_cliente')
      ]
    ])
  );
}

export async function handleVincularCliente(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  // Buscar lista de clientes
  const { data: clientes, error } = await adminSupabase
    .from('clientes')
    .select('id, nome_empresa')
    .eq('user_id', userId)
    .limit(5);

  if (error || !clientes) {
    return ctx.reply('Erro ao buscar clientes. Por favor, tente novamente.');
  }

  // Criar botões para clientes
  const clientesButtons = clientes.map(cliente => 
    [Markup.button.callback(cliente.nome_empresa, `agenda_cliente_${cliente.id}`)]
  );

  // Adicionar opção de pular
  clientesButtons.push([Markup.button.callback('➡️ Pular', 'agenda_sem_cliente')]);

  await ctx.reply(
    'Escolha um cliente para vincular ao compromisso:',
    Markup.inlineKeyboard(clientesButtons)
  );
}

// Continuação com outros handlers...