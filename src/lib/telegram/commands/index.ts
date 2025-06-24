import { Telegraf, Markup } from 'telegraf';
import { handleStart } from './start';
import { handleAjuda } from './ajuda';
import { 
  handleClientes, 
  handleClientesAdicionar, 
  handleClientesListar, 
  handleClientesBuscar,
  listarClientesPaginados 
} from './clientes';
import { adminSupabase } from '@/lib/supabase';

// Importação de comandos futuros:
// import { handleAgenda } from './agenda';
// import { handleFollowUp } from './followup';
// import { handleLembrete } from './lembrete';

export const registerCommands = (bot: Telegraf) => {
  //=============================================================================
  // COMANDOS BÁSICOS
  //=============================================================================
  bot.command(['start', 'inicio'], handleStart);
  bot.command('ajuda', handleAjuda);
  
  //=============================================================================
  // COMANDOS DE CLIENTES
  //=============================================================================
  bot.command('clientes', handleClientes);
  bot.command('clientes_adicionar', handleClientesAdicionar);
  bot.command('clientes_listar', handleClientesListar);
  bot.command('clientes_buscar', handleClientesBuscar);
  // Comandos futuros de clientes:
  // bot.command('clientes_editar', handleClientesEditar);
  
  //=============================================================================
  // COMANDOS DE AGENDA (comentados até implementação)
  //=============================================================================
  // bot.command('agenda', handleAgenda);
  // bot.command('agenda_registrar', handleAgendaRegistrar);
  // bot.command('agenda_visualizar', handleAgendaVisualizar);
  
  //=============================================================================
  // COMANDOS DE FOLLOW-UP (comentados até implementação)
  //=============================================================================
  // bot.command('followup', handleFollowUp);
  // bot.command('followup_iniciar', handleFollowUpIniciar);
  // bot.command('followup_visualizar', handleFollowUpVisualizar);
  
  //=============================================================================
  // COMANDOS DE LEMBRETES (comentados até implementação)
  //=============================================================================
  // bot.command('lembrete', handleLembrete);
  // bot.command('lembrete_criar', handleLembreteCriar);
  // bot.command('lembrete_visualizar', handleLembreteVisualizar);

  //=============================================================================
  // CALLBACKS DE BOTÕES INLINE
  //=============================================================================
  // Callbacks para comandos de clientes
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
  
  bot.action('clientes_editar', (ctx) => {
    ctx.answerCbQuery();
    return ctx.reply('Esta funcionalidade ainda está em desenvolvimento.');
  });

  bot.action('buscar_nome_empresa', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
      // Atualizar sessão para busca por nome de empresa
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
  
  bot.action('buscar_cnpj', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
      // Atualizar sessão para busca por CNPJ
      await adminSupabase
        .from('sessions')
        .update({
          step: 'buscar_cnpj',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
      
      await ctx.reply('Digite o CNPJ que deseja buscar:');
    } catch (error) {
      console.error('Erro ao configurar busca:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  bot.action('buscar_contato', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      
      // Atualizar sessão para busca por nome do contato
      await adminSupabase
        .from('sessions')
        .update({
          step: 'buscar_contato',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
      
      await ctx.reply('Digite o nome do contato que deseja buscar:');
    } catch (error) {
      console.error('Erro ao configurar busca:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // Manipular botões de edição de cliente específico
  bot.action(/editar_cliente_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Extrair o ID do cliente do botão
      const clienteId = ctx.match[1];
      const telegramId = ctx.from?.id;
      
      // Buscar o cliente
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
      
      console.log("Cliente encontrado para edição:", cliente);
      
      // Armazenar dados do cliente em uma sessão, preservando o ID
      await adminSupabase
        .from('sessions')
        .delete() // Limpar sessões antigas
        .eq('telegram_id', telegramId);
        
      // Criar nova sessão com os dados do cliente
      const { error: sessionError } = await adminSupabase
        .from('sessions')
        .insert([{
          telegram_id: telegramId,
          user_id: cliente.user_id,
          command: 'clientes',
          step: 'editar_cliente',
          data: cliente, // Preserva o id do cliente
          updated_at: new Date().toISOString()
        }]);
      
      if (sessionError) {
        console.error("Erro ao criar sessão:", sessionError);
        await ctx.reply("Erro ao iniciar edição. Tente novamente.");
        return;
      }
      
      // Apresentar opções de campos para edição - ADICIONADO EMAIL
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

  // Manipular botões de exclusão de cliente
  bot.action(/excluir_cliente_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Extrair o ID do cliente do botão
      const clienteId = ctx.match[1];
      
      // Pedir confirmação antes de excluir
      await ctx.reply(
        `⚠️ Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Sim, excluir', `confirmar_exclusao_${clienteId}`)],
          [Markup.button.callback('❌ Não, cancelar', 'cancelar_exclusao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao processar exclusão:', error);
      ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // Confirmação de exclusão
  bot.action(/confirmar_exclusao_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Extrair o ID do cliente do botão
      const clienteId = ctx.match[1];
      
      // Excluir o cliente
      const { error } = await adminSupabase
        .from('clientes')
        .delete()
        .eq('id', clienteId);
      
      if (error) {
        console.error('Erro ao excluir cliente:', error);
        await ctx.reply('Erro ao excluir cliente. Por favor, tente novamente.');
        return;
      }
      
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remover botões
      
      await ctx.reply('✅ Cliente excluído com sucesso!', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    } catch (error) {
      console.error('Erro ao confirmar exclusão:', error);
      ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // Cancelar exclusão
  bot.action('cancelar_exclusao', async (ctx) => {
    ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remover botões
    await ctx.reply('Exclusão cancelada.');
  });


  // Callbacks para confirmação de cadastro/edição de cliente
  bot.action('cliente_confirmar', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Obter a sessão atual
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
      
      // Verificar se estamos editando um cliente existente ou criando um novo
      const isEditing = session.data.id !== undefined;
      
      if (isEditing) {
        // ATUALIZAÇÃO: Estamos editando um cliente existente
        const clienteId = session.data.id;
        
        const { error: updateError } = await adminSupabase
          .from('clientes')
          .update({
            nome_empresa: session.data.nome_empresa,
            cnpj: session.data.cnpj,
            contato_nome: session.data.contato_nome,
            contato_telefone: session.data.contato_telefone,
            contato_email: session.data.contato_email, // Novo campo
            updated_at: new Date().toISOString()
          })
          .eq('id', clienteId);

        if (updateError) {
          console.error('Error updating client:', updateError);
          await ctx.reply('Ocorreu um erro ao atualizar o cliente. Por favor, tente novamente.');
          return;
        }
        
        // Mensagem de sucesso
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remover botões
        
        await ctx.reply(`
  ✅ Cliente atualizado com sucesso!

  Empresa: ${session.data.nome_empresa}
  Contato: ${session.data.contato_nome}
        `, 
          Markup.inlineKeyboard([
            [Markup.button.callback('📋 Listar clientes', 'clientes_listar')],
            [Markup.button.callback('🏠 Menu principal', 'menu_principal')]
          ])
        );
      } else {
        // CRIAÇÃO: Estamos criando um novo cliente
        const { error: insertError } = await adminSupabase
          .from('clientes')
          .insert({
            user_id: session.user_id,
            nome_empresa: session.data.nome_empresa,
            cnpj: session.data.cnpj,
            contato_nome: session.data.contato_nome,
            contato_telefone: session.data.contato_telefone,
            contato_email: session.data.contato_email, // Novo campo
            updated_at: new Date().toISOString()
          });

        if (insertError) {
          console.error('Error inserting client:', insertError);
          await ctx.reply('Ocorreu um erro ao cadastrar o cliente. Por favor, tente novamente.');
          return;
        }
        
        // Mensagem de sucesso
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remover botões
        
        await ctx.reply(`
  ✅ Cliente cadastrado com sucesso!

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

      // Limpar sessão em ambos os casos
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
    } catch (error) {
      console.error('Erro ao confirmar cliente:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });  



  bot.action('cliente_cancelar', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      // Limpar sessão
      const telegramId = ctx.from?.id;
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('telegram_id', telegramId);
      
      // Editar mensagem para remover os botões
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      
      await ctx.reply('❌ Cadastro de cliente cancelado.', 
        Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Tentar novamente', 'clientes_adicionar')],
          [Markup.button.callback('🏠 Voltar ao menu', 'menu_principal')]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao cancelar:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });
  
// EDITAR CLIENTE
bot.action('cliente_editar', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    // Obter a sessão atual
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
    
    // Apresentar opções de campos para edição - ADICIONADO EMAIL
    await ctx.editMessageReplyMarkup({ inline_keyboard: [] }); // Remover botões atuais
    
    await ctx.reply(
      `Qual campo você deseja editar?`,
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
    console.error('Erro ao editar cliente:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
});

bot.action('edit_nome_empresa', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão para indicar que estamos editando o nome da empresa
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_nome_empresa',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite o novo nome da empresa:');
  } catch (error) {
    console.error('Erro ao configurar edição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});

bot.action('edit_cnpj', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão para indicar que estamos editando o CNPJ
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_cnpj',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite o novo CNPJ (ou "pular" para deixar em branco):');
  } catch (error) {
    console.error('Erro ao configurar edição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});

bot.action('edit_contato_nome', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão para indicar que estamos editando o nome do contato
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_contato_nome',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite o novo nome do contato:');
  } catch (error) {
    console.error('Erro ao configurar edição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});

bot.action('edit_contato_telefone', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão para indicar que estamos editando o telefone
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_contato_telefone',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite o novo telefone (ou "pular" para deixar em branco):');
  } catch (error) {
    console.error('Erro ao configurar edição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});  

bot.action('edit_contato_email', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão para indicar que estamos editando o email
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_contato_email',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite o novo email do contato (ou "pular" para deixar em branco):');
  } catch (error) {
    console.error('Erro ao configurar edição de email:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});

bot.action('edit_observacoes', async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const telegramId = ctx.from?.id;
    
    // Atualizar sessão
    await adminSupabase
      .from('sessions')
      .update({
        step: 'edit_observacoes',
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
    
    await ctx.reply('Digite as novas observações (ou "pular" para deixar em branco):');
  } catch (error) {
    console.error('Erro ao configurar edição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});

// Função para listar clientes com paginação
bot.action(/listar_pagina_(\d+)/, async (ctx) => {
  try {
    ctx.answerCbQuery();
    
    const page = parseInt(ctx.match[1]);
    const telegramId = ctx.from?.id;
    const userId = ctx.state.user?.id;
    
    if (!userId) {
      return ctx.reply('Sessão expirada. Por favor, tente novamente.');
    }
    
    // Atualizar sessão
    await adminSupabase
      .from('sessions')
      .update({
        data: { page },
        updated_at: new Date().toISOString()
      })
      .eq('telegram_id', telegramId);
      
    // Buscar nova página
    await listarClientesPaginados(ctx, userId, page);
  } catch (error) {
    console.error('Erro na paginação:', error);
    ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
});



  // Botão de menu principal
  bot.action('menu_principal', (ctx) => {
    ctx.answerCbQuery();
    return handleClientes(ctx);
  });
};