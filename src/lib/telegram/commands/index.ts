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
import { validators } from '../utils/validators';
import { handleLembretes, registerLembretesCallbacks } from './lembretes';
import { handleFollowup, registerFollowupCallbacks } from './followup';
import { getEstagioTexto, isValidEstagio } from './followup/types';

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
    return handleFollowup(ctx);
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

  // ========================================================================
  // COMANDOS DE FOLLOWUP
  // ========================================================================
  bot.command('followup', handleFollowup);

  // ========================================================================
  // REGISTRAR CALLBACKS DE FOLLOWUP 
  // ========================================================================
  registerFollowupCallbacks(bot);

// ========================================================================
  // CALLBACK PARA SELECIONAR CLIENTE NO FOLLOWUP
  // ========================================================================
  bot.action(/followup_selecionar_cliente_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;

      if (!telegramId || !userId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Buscar dados do cliente
      const { data: cliente, error } = await adminSupabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .eq('user_id', userId)
        .single();

      if (error || !cliente) {
        return ctx.reply('Cliente não encontrado.');
      }

      // Verificar se já tem followup ativo para este cliente
      const { data: followupExistente } = await adminSupabase
        .from('followups')
        .select('id, titulo')
        .eq('cliente_id', clienteId)
        .eq('user_id', userId)
        .eq('status', 'ativo')
        .single();

      if (followupExistente) {
        // Cliente já tem followup ativo - pedir confirmação
        await ctx.reply(
          `⚠️ **Atenção!**\n\n` +
          `O cliente **${cliente.nome_empresa}** já possui um follow-up ativo:\n` +
          `"${followupExistente.titulo}"\n\n` +
          `Deseja substituir pelo novo follow-up?\n` +
          `(O anterior será marcado como perdido)`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Sim, substituir', `confirmar_substituir_${clienteId}`)],
              [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
            ])
          }
        );
        return;
      }

      // Cliente sem followup ativo - continuar criação
      await continuarCriacaoFollowup(ctx, telegramId, userId, cliente);

    } catch (error) {
      console.error('Erro ao selecionar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACK PARA CONFIRMAR SUBSTITUIÇÃO DE FOLLOWUP
  // ========================================================================
  bot.action(/confirmar_substituir_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      const userId = ctx.state.user?.id;

      if (!telegramId || !userId) {
        return ctx.reply('Não foi possível identificar seu usuário.');
      }

      // Marcar followup existente como perdido
      await adminSupabase
        .from('followups')
        .update({
          status: 'perdido',
          updated_at: new Date().toISOString()
        })
        .eq('cliente_id', clienteId)
        .eq('user_id', userId)
        .eq('status', 'ativo');

      // Buscar dados do cliente
      const { data: cliente, error } = await adminSupabase
        .from('clientes')
        .select('*')
        .eq('id', clienteId)
        .eq('user_id', userId)
        .single();

      if (error || !cliente) {
        return ctx.reply('Cliente não encontrado.');
      }

      // Continuar criação do novo followup
      await continuarCriacaoFollowup(ctx, telegramId, userId, cliente);

    } catch (error) {
      console.error('Erro ao substituir followup:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS PARA ESTÁGIOS DO FOLLOWUP
  // ========================================================================
  bot.action('estagio_prospeccao', (ctx) => selecionarEstagio(ctx, 'prospeccao'));
  bot.action('estagio_apresentacao', (ctx) => selecionarEstagio(ctx, 'apresentacao'));
  bot.action('estagio_proposta', (ctx) => selecionarEstagio(ctx, 'proposta'));
  bot.action('estagio_negociacao', (ctx) => selecionarEstagio(ctx, 'negociacao'));
  bot.action('estagio_fechamento', (ctx) => selecionarEstagio(ctx, 'fechamento'));

  // ========================================================================
  // CALLBACKS PARA ATUALIZAR ESTÁGIO APÓS CONTATO
  // ========================================================================
  bot.action(/atualizar_estagio_([0-9a-fA-F-]+)_(\w+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const followupId = ctx.match[1];
      const novoEstagio = ctx.match[2];
      const userId = ctx.state.user?.id;

      if (!userId) {
        return ctx.reply('Sessão expirada.');
      }

      // Validar estágio antes de usar
      if (!isValidEstagio(novoEstagio)) {
        return ctx.reply('Estágio inválido.');
      }

      // Atualizar estágio
      const { error } = await adminSupabase
        .from('followups')
        .update({
          estagio: novoEstagio,
          updated_at: new Date().toISOString()
        })
        .eq('id', followupId)
        .eq('user_id', userId);

      if (error) {
        console.error('Erro ao atualizar estágio:', error);
        return ctx.reply('Erro ao atualizar estágio.');
      }

      // Usar função segura para obter texto do estágio
      const estagioTexto = getEstagioTexto(novoEstagio);

      await ctx.editMessageText(
        `✅ **Estágio atualizado para:** ${estagioTexto}\n\n` +
        `📈 Follow-up progredindo bem! Continue assim!`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('📋 Ver Follow-ups', 'followup_listar_ativos'),
              Markup.button.callback('📊 Menu Follow-up', 'menu_followup')
            ],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );

    } catch (error) {
      console.error('Erro ao atualizar estágio:', error);
      await ctx.reply('Ocorreu um erro ao atualizar o estágio.');
    }
  });


  bot.action('manter_estagio_atual', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.editMessageText(
      `✅ **Contato registrado com sucesso!**\n\n` +
      `🎯 Estágio mantido como estava.\n` +
      `📈 Continue trabalhando esta oportunidade!`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📋 Ver Follow-ups', 'followup_listar_ativos'),
            Markup.button.callback('📊 Menu Follow-up', 'menu_followup')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      }
    );
  });

  // ========================================================================
  // FUNÇÕES AUXILIARES
  // ========================================================================
  async function continuarCriacaoFollowup(ctx: any, telegramId: number, userId: string, cliente: any) {
    // Criar sessão para dados do followup
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
        step: 'titulo_followup',
        data: {
          cliente_id: cliente.id,
          nome_cliente: cliente.nome_empresa,
          contato_nome: cliente.contato_nome
        },
        updated_at: new Date().toISOString()
      }]);

    const contatoInfo = cliente.contato_nome ? ` - ${cliente.contato_nome}` : '';
    const telefoneInfo = cliente.contato_telefone 
      ? `\n📞 ${validators.formatters.telefone(cliente.contato_telefone)}`
      : '';

    await ctx.editMessageText(
      `✅ **Cliente selecionado:**\n\n` +
      `🏢 ${cliente.nome_empresa}${contatoInfo}${telefoneInfo}\n\n` +
      `📝 Digite o **título da oportunidade**:\n\n` +
      `Exemplos: "Venda Sistema ERP", "Consultoria em TI"`
    );
  }

  async function selecionarEstagio(ctx: any, estagio: string) {
    try {
      ctx.answerCbQuery();
      const telegramId = ctx.from?.id;

      // Atualizar sessão com estágio selecionado
      await adminSupabase
        .from('sessions')
        .update({
          step: 'valor_estimado',
          data: (await adminSupabase
            .from('sessions')
            .select('data')
            .eq('telegram_id', telegramId)
            .single()
          ).data?.data ? {
            ...(await adminSupabase
              .from('sessions')
              .select('data')
              .eq('telegram_id', telegramId)
              .single()
            ).data.data,
            estagio
          } : { estagio },
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);

      const estagioTexto = {
        'prospeccao': '🔍 Prospecção',
        'apresentacao': '📋 Apresentação',
        'proposta': '💰 Proposta',
        'negociacao': '🤝 Negociação',
        'fechamento': '✅ Fechamento'
      }[estagio];

      await ctx.editMessageText(
        `✅ Estágio: **${estagioTexto}**\n\n` +
        `💰 Valor estimado da oportunidade (opcional, digite "pular"):\n\n` +
        `Exemplos: 15000, 25.500, 100000`
      );

    } catch (error) {
      console.error('Erro ao selecionar estágio:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  }  

};