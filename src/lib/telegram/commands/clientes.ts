import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { Cliente } from '@/types/database';
import { validators } from '@/utils/validators';

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
    ])
  );
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
    return ctx.reply('Você precisa estar autenticado para usar este comando.');
  }

  // Verificar se há um parâmetro de página
  let page = 0;
  
  // Criar sessão para armazenar estado de paginação
  try {
    const telegramId = ctx.from?.id;
    
    // Limpar sessões existentes
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);
      
    // Salvar estado inicial de paginação
    await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'clientes',
        step: 'listar_paginacao',
        data: { page },
        updated_at: new Date().toISOString()
      }]);
      
    // Buscar clientes com paginação
    return listarClientesPaginados(ctx, userId, page);
  } catch (error) {
    console.error('Erro ao iniciar listagem:', error);
    return ctx.reply('Ocorreu um erro ao listar clientes. Por favor, tente novamente.');
  }
}

// Função para listar clientes com paginação
export async function listarClientesPaginados(ctx: Context, userId: string, page: number) {
  try {
    const pageSize = 5; // 5 clientes por página
    const offset = page * pageSize;
    
    // Contar total de clientes
    const { count, error: countError } = await adminSupabase
      .from('clientes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
      
    if (countError) {
      console.error('Erro ao contar clientes:', countError);
      return ctx.reply('Ocorreu um erro ao listar os clientes.');
    }

    // Tratamento para garantir que count não seja null
    const totalClientes = count || 0;

    // Buscar clientes da página atual
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('*')
      .eq('user_id', userId)
      .order('nome_empresa', { ascending: true })
      .range(offset, offset + pageSize - 1);

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

    // Calcular total de páginas usando o valor tratado
    const totalPages = Math.ceil(totalClientes / pageSize);
    
    // Construir resposta
    let response = `📋 <b>Seus Clientes</b> (${page + 1}/${totalPages})\n\n`;
    
    clientes.forEach((cliente, index) => {
      response += `<b>${index + 1 + offset}. ${cliente.nome_empresa}</b>\n`;
      if (cliente.contato_nome) response += `👤 ${cliente.contato_nome}\n`;
      // Aplicar formatação ao telefone
      if (cliente.contato_telefone) {
        const telefoneFormatado = validators.formatters.telefone(cliente.contato_telefone);
        response += `📞 ${telefoneFormatado}\n`;
      }
      if (cliente.contato_email) response += `✉️ ${cliente.contato_email}\n`;
      response += '\n';
    });
    
    // Botões de navegação
    const buttons = [];
    
    // Linha de botões de paginação
    const paginationButtons = [];
    
    if (page > 0) {
      paginationButtons.push(Markup.button.callback('⬅️ Anterior', `listar_pagina_${page - 1}`));
    }
    
    if (page < totalPages - 1) {
      paginationButtons.push(Markup.button.callback('➡️ Próxima', `listar_pagina_${page + 1}`));
    }
    
    if (paginationButtons.length > 0) {
      buttons.push(paginationButtons);
    }
    
    // Botões de ações
    buttons.push([Markup.button.callback('🔍 Buscar Cliente', 'clientes_buscar')]);
    buttons.push([Markup.button.callback('🏠 Menu Principal', 'menu_principal')]);
    
    return ctx.reply(response, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard(buttons)
    });
  } catch (error) {
    console.error('Erro inesperado:', error);
    return ctx.reply('Ocorreu um erro ao listar os clientes.');
  }
}

// Manipulador para buscar clientes existentes
export async function handleClientesBuscar(ctx: Context) {
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

    // Criar sessão para busca de cliente
    await adminSupabase
      .from('sessions')
      .insert([
        {
          telegram_id: ctx.from?.id,
          user_id: userId,
          command: 'clientes',
          step: 'buscar_tipo',
          data: {},
          updated_at: new Date().toISOString()
        }
      ]);

    return ctx.reply(
      `🔍 Busca de Clientes\n\nComo deseja buscar?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Nome da Empresa', 'buscar_nome_empresa')],
        [Markup.button.callback('CNPJ', 'buscar_cnpj')],
        [Markup.button.callback('Nome do Contato', 'buscar_contato')],
        [Markup.button.callback('Cancelar Busca', 'menu_principal')]
      ])
    );
  } catch (error) {
    console.error('Erro ao iniciar busca de clientes:', error);
    return ctx.reply('Ocorreu um erro ao iniciar a busca. Por favor, tente novamente.');
  }
}

/**
 * Manipulador para editar clientes (a ser implementado)
 */
/*
export async function handleClientesEditar(ctx: Context) {
  // Implementação futura
}
*/