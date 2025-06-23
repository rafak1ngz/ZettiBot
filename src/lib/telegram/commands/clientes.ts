import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { Cliente } from '@/types/database';

/**
 * Manipulador principal para o comando /clientes
 * Mostra as opções disponíveis para gerenciamento de clientes usando botões interativos
 */
export async function handleClientes(ctx: Context) {
  // Verificar se o usuário está autenticado
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando. Use /inicio para registrar-se.');
  }

  return ctx.reply(
    `Gerenciamento de Clientes ZettiBot 📇\n\nO que deseja fazer?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('1️⃣ Adicionar novo cliente', 'clientes_adicionar')],
      [Markup.button.callback('2️⃣ Buscar cliente existente', 'clientes_buscar')],
      [Markup.button.callback('3️⃣ Listar todos os clientes', 'clientes_listar')],
      [Markup.button.callback('4️⃣ Editar informações de cliente', 'clientes_editar')]
    ])
  );
}

/**
 * Manipulador para buscar clientes (a ser implementado)
 */
/*
export async function handleClientesBuscar(ctx: Context) {
  // Implementação futura
}
*/

/**
 * Manipulador para editar clientes (a ser implementado)
 */
/*
export async function handleClientesEditar(ctx: Context) {
  // Implementação futura
}
*/