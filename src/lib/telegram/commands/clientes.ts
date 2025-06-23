import { Context } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { Cliente } from '@/types/database';

/**
 * Manipulador principal para o comando /clientes
 * Mostra as opções disponíveis para gerenciamento de clientes
 */
export async function handleClientes(ctx: Context) {
  // Verificar se o usuário está autenticado
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando. Use /inicio para registrar-se.');
  }

  return ctx.reply(`
Gerenciamento de Clientes ZettiBot 📇

O que deseja fazer?

1️⃣ Adicionar novo cliente
2️⃣ Buscar cliente existente
3️⃣ Listar todos os clientes
4️⃣ Editar informações de cliente

Escolha uma opção:
- /clientes_adicionar
- /clientes_buscar
- /clientes_listar
- /clientes_editar
  `);
}

/**
 * Manipulador para iniciar o processo de adicionar um novo cliente
 * Cria uma sessão e solicita o nome da empresa
 */
export async function handleClientesAdicionar(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando. Use /inicio para registrar-se.');
  }

  try {
    // Limpar sessões existentes
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', ctx.from?.id);

    // Criar sessão para adicionar cliente
    await adminSupabase
      .from('sessions')
      .insert([
        {
          telegram_id: ctx.from?.id,
          user_id: userId,
          command: 'clientes',
          step: 'nome_empresa',
          data: {},
          updated_at: new Date().toISOString()
        }
      ]);

    return ctx.reply(`
📝 Vamos adicionar um novo cliente!

Por favor, me informe o nome da empresa:
    `);
  } catch (error) {
    console.error('Erro ao iniciar sessão de cliente:', error);
    return ctx.reply('Ocorreu um erro ao processar seu comando. Por favor, tente novamente.');
  }
}

/**
 * Manipulador para listar clientes cadastrados
 * Mostra os últimos 10 clientes do usuário
 */
export async function handleClientesListar(ctx: Context) {
  const userId = ctx.state.user?.id;
  if (!userId) {
    return ctx.reply('Você precisa estar autenticado para usar este comando. Use /inicio para registrar-se.');
  }

  try {
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Erro ao listar clientes:', error);
      return ctx.reply('Ocorreu um erro ao listar os clientes.');
    }

    if (!clientes || clientes.length === 0) {
      return ctx.reply(`
Você ainda não possui clientes cadastrados.

Use /clientes_adicionar para cadastrar seu primeiro cliente!
      `);
    }

    let response = "📋 Seus últimos 10 clientes:\n\n";
    clientes.forEach((cliente: Cliente, index: number) => {
      response += `${index + 1}. ${cliente.nome_empresa}\n`;
      if (cliente.contato_nome) response += `   Contato: ${cliente.contato_nome}\n`;
      if (cliente.contato_telefone) response += `   Telefone: ${cliente.contato_telefone}\n\n`;
    });

    response += "\nPara ver mais detalhes ou editar um cliente, use /clientes_buscar";

    return ctx.reply(response);
  } catch (error) {
    console.error('Erro inesperado:', error);
    return ctx.reply('Ocorreu um erro ao listar os clientes.');
  }
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