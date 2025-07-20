import { Telegraf, Markup, Context } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda } from './ajuda';
import { 
  handleClientes, 
  handleClientesAdicionar, 
  handleClientesListar, 
  handleClientesBuscar,
  listarClientesPaginados 
} from './clientes';
import { handleLembretes, registerLembretesCallbacks } from './lembretes';

// ============================================================================
// IMPORTAR NOVO MÓDULO DE AGENDA
// ============================================================================
import { registerAgendaCommands } from './agenda';

import { adminSupabase } from '@/lib/supabase';

// ============================================================================
// COMANDO CANCELAR
// ============================================================================
export async function handleCancelar(ctx: Context) {
  const telegramId = ctx.from?.id;
  
  if (!telegramId) {
    return ctx.reply('Não foi possível identificar seu usuário.');
  }

  try {
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Erro ao limpar sessão:', error);
      return ctx.reply('Ocorreu um erro ao cancelar a operação.');
    }

    await ctx.reply(`❌ Operação cancelada com sucesso!`);
    return handleMenuPrincipal(ctx);

  } catch (error) {
    console.error('Erro inesperado no cancelamento:', error);
    return ctx.reply('Ocorreu um erro ao cancelar a operação.');
  }
}

// ============================================================================
// MENU PRINCIPAL
// ============================================================================
export async function handleMenuPrincipal(ctx: Context) {
  try {
    await ctx.reply(`Olá, ${ctx.from?.first_name || 'vendedor'}! 👋 

Bem-vindo ao ZettiBot 🚀, seu assistente digital de vendas.

Escolha uma das opções abaixo:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('👥 Gerenciar Clientes', 'menu_clientes')],
      [Markup.button.callback('📅 Gerenciar Agenda', 'menu_agenda')],
      [Markup.button.callback('📊 Follow Up', 'menu_followup')],
      [Markup.button.callback('🔔 Lembretes', 'menu_lembretes')],
      [Markup.button.callback('❓ Ajuda', 'menu_ajuda')]
    ]));
    return true;
  } catch (error) {
    console.error('Erro ao mostrar menu principal:', error);
    return false;
  }
}

// ============================================================================
// REGISTRO DE TODOS OS COMANDOS
// ============================================================================
export const registerCommands = (bot: Telegraf) => {
  
  // ========================================================================
  // COMANDOS BÁSICOS
  // ========================================================================
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  bot.command('cancelar', handleCancelar);
  bot.action('cancelar_acao', handleCancelar);

  // ========================================================================
  // COMANDOS MENU PRINCIPAL
  // ========================================================================
  bot.action('menu_principal', (ctx) => {
    ctx.answerCbQuery();
    return handleMenuPrincipal(ctx);
  });

  bot.action('menu_clientes', (ctx) => {
    ctx.answerCbQuery();
    return handleClientes(ctx);
  });

  bot.action('menu_followup', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('O módulo de Follow Up está em desenvolvimento. Em breve estará disponível!');
  });

  bot.action('menu_lembretes', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('O módulo de Lembretes está em desenvolvimento. Em breve estará disponível!');
  });

  bot.action('menu_ajuda', (ctx) => {
    ctx.answerCbQuery();
    return handleAjuda(ctx);
  });

  // ========================================================================
  // REGISTRAR MÓDULO DE AGENDA COMPLETO - LINHA PRINCIPAL!
  // ========================================================================
  registerAgendaCommands(bot);

  // ========================================================================
  // COMANDOS DE CLIENTES (MANTIDO ORIGINAL)
  // ========================================================================
  bot.command('clientes', handleClientes);
  bot.command('clientes_adicionar', handleClientesAdicionar);
  bot.command('clientes_listar', handleClientesListar);
  bot.command('clientes_buscar', handleClientesBuscar);
  
  bot.action('clientes_adicionar', (ctx) => {
    ctx.answerCbQuery();
    return handleClientesAdicionar(ctx);
  });
  
  bot.action('clientes_listar', (ctx) => {
    ctx.answerCbQuery();
    return handleClientesListar(ctx);
  });
  
  bot.action('clientes_buscar', (ctx) => {
    ctx.answerCbQuery();
    return handleClientesBuscar(ctx);
  });

  // ========================================================================
  // CALLBACKS DE BUSCA DE CLIENTES
  // ========================================================================
  bot.action('buscar_nome_empresa', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'buscar_nome_empresa',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
      
      await ctx.reply('Digite o nome da empresa que deseja buscar:');
    } catch (error) {
      console.error('Erro ao configurar busca:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });
  
  // ========================================================================
  // CALLBACKS DE EDIÇÃO DE CLIENTE (manter original)
  // ========================================================================
  bot.action(/editar_cliente_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      
      const { data: cliente, error } = await adminSupabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .single();
      
      if (error || !cliente) {
        console.error('Erro ao buscar cliente:', error);
        await ctx.reply('Erro ao buscar cliente. Por favor, tente novamente.');
        return;
      }
      
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('telegram_id', telegramId);
        
      const { error: sessionError } = await adminSupabase
        .from('sessions')
        .insert([{
          telegram_id: telegramId,
          user_id: cliente.user_id,
          command: 'clientes',
          step: 'editar_cliente',
          data: cliente,
          updated_at: new Date().toISOString()
        }]);
      
      if (sessionError) {
        console.error("Erro ao criar sessão:", sessionError);
        await ctx.reply("Erro ao iniciar edição. Tente novamente.");
        return;
      }
      
      await ctx.reply(
        `O que você deseja editar em "${cliente.nome_empresa}"?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Nome da Empresa', 'edit_nome_empresa')],
          [Markup.button.callback('CNPJ', 'edit_cnpj')],
          [Markup.button.callback('Nome do Contato', 'edit_contato_nome')],
          [Markup.button.callback('Telefone', 'edit_contato_telefone')],
          [Markup.button.callback('Email', 'edit_contato_email')],
          [Markup.button.callback('Observações', 'edit_observacoes')],
          [Markup.button.callback('Cancelar Edição', 'cliente_cancelar')]
        ])
      );
    } catch (error) {
      console.error('Erro ao processar edição:', error);
      ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACKS DE CONFIRMAÇÃO DE CLIENTE
  // ========================================================================
  bot.action('cliente_confirmar', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .order('updated_at', { ascending: false })
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie o processo novamente.');
      }
      
      const session = sessions[0];
      const isEditing = session.data.id !== undefined;
      
      if (isEditing) {
        const clienteId = session.data.id;
        
        const { error: updateError } = await adminSupabase
          .from('clientes')
          .update({
            nome_empresa: session.data.nome_empresa,
            cnpj: session.data.cnpj,
            contato_nome: session.data.contato_nome,
            contato_telefone: session.data.contato_telefone,
            contato_email: session.data.contato_email,
            observacoes: session.data.observacoes,
            updated_at: new Date().toISOString()
          })
          .eq('id', clienteId);

        if (updateError) {
          console.error('Error updating client:', updateError);
          await ctx.reply('Ocorreu um erro ao atualizar o cliente. Por favor, tente novamente.');
          return;
        }
        
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        
        await ctx.reply(`✅ Cliente atualizado com sucesso!

Empresa: ${session.data.nome_empresa}
Contato: ${session.data.contato_nome}`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('📋 Listar clientes', 'clientes_listar')],
            [Markup.button.callback('🏠 Menu principal', 'menu_principal')]
          ])
        );
      } else {
        const { error: insertError } = await adminSupabase
          .from('clientes')
          .insert({
            user_id: session.user_id,
            nome_empresa: session.data.nome_empresa,
            cnpj: session.data.cnpj,
            contato_nome: session.data.contato_nome,
            contato_telefone: session.data.contato_telefone,
            contato_email: session.data.contato_email,
            observacoes: session.data.observacoes,
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('Error inserting client:', insertError);
          await ctx.reply('Ocorreu um erro ao cadastrar o cliente. Por favor, tente novamente.');
          return;
        }
        
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        
        await ctx.reply(`✅ Cliente cadastrado com sucesso!

Empresa: ${session.data.nome_empresa}
Contato: ${session.data.contato_nome}

O que deseja fazer agora?`, 
          Markup.inlineKeyboard([
            [Markup.button.callback('➕ Adicionar outro cliente', 'clientes_adicionar')],
            [Markup.button.callback('📋 Listar clientes', 'clientes_listar')],
            [Markup.button.callback('🏠 Menu principal', 'menu_principal')]
          ])
        );
      }

      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
    } catch (error) {
      console.error('Erro ao confirmar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // COMANDOS DE LEMBRETES
  // ========================================================================
  bot.command('lembrete', handleLembretes);
  bot.command('lembrete_criar', (ctx) => {
    return handleLembretes(ctx); // Vai para o menu principal
  });
  bot.command('lembrete_listar', (ctx) => {
    return handleLembretes(ctx); // Vai para o menu principal
  });

  // ========================================================================
  // CALLBACK DO MENU PRINCIPAL
  // ========================================================================
  bot.action('menu_lembretes', (ctx) => {
    ctx.answerCbQuery();
    return handleLembretes(ctx);
  });

  // ========================================================================
  // REGISTRAR CALLBACKS DE LEMBRETES
  // ========================================================================
  registerLembretesCallbacks(bot);
  
};