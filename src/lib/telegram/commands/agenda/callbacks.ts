import { Context, Markup, Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  handleNovoCompromisso, 
  handleVincularCliente,
  handleSemCliente,
  handleListarCompromissos,
  handleSelecionarCliente,
  mostrarCompromissosPaginados   
} from './handlers';
import { 
  handleConfiguracoesNotificacao, 
  processarNotificacaoCompromisso 
} from './notifications';


export function registerAgendaCallbacks(bot: Telegraf) {
  // Callbacks para o menu da agenda
  bot.action('agenda_novo', (ctx) => {
    ctx.answerCbQuery();
    return handleNovoCompromisso(ctx);
  });

  bot.action('agenda_vincular_cliente', (ctx) => {
    ctx.answerCbQuery();
    return handleVincularCliente(ctx);
  });

  bot.action('agenda_sem_cliente', (ctx) => {
    ctx.answerCbQuery();
    return handleSemCliente(ctx);
  });

  bot.action('agenda_listar', (ctx) => {
    ctx.answerCbQuery();
    return handleListarCompromissos(ctx);
  });

  bot.action(/agenda_cliente_(.+)/, (ctx) => {
    ctx.answerCbQuery();
    const clienteId = ctx.match[1];
    return handleSelecionarCliente(ctx, clienteId);
  });

  // Confirmação de compromisso com notificações
  bot.action('agenda_confirmar', async (ctx) => {
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
      
      // Inserir compromisso
      const { data: novoCompromisso, error: insertError } = await adminSupabase
        .from('compromissos')
        .insert({
          user_id: session.user_id,
          cliente_id: session.data.cliente_id,
          titulo: session.data.titulo,
          descricao: session.data.descricao,
          data_compromisso: session.data.data_compromisso || session.data.data_hora,
          local: session.data.local,
          status: 'pendente',
          updated_at: new Date().toISOString()
        })
        .select('id')
        .single();
        
      if (insertError || !novoCompromisso) {
        console.error('Erro ao inserir compromisso:', insertError);
        await ctx.reply('Ocorreu um erro ao salvar o compromisso. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
      // Redirecionar para configuração de notificações
      await handleConfiguracoesNotificacao(ctx, novoCompromisso.id);
      
    } catch (error) {
      console.error('Erro ao confirmar compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Callbacks para notificações
  bot.action(/agenda_notificacao_(.+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      const compromissoId = ctx.match[1];
      await handleConfiguracoesNotificacao(ctx, compromissoId);
    } catch (error) {
      console.error('Erro no callback de notificação:', error);
      await ctx.reply('Ocorreu um erro ao processar notificação.');
    }
  });

  // Callbacks para diferentes tempos de notificação
  bot.action(/notif_nao_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, 'nao', compromissoId);
  });

  bot.action(/notif_15m_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '15m', compromissoId);
  });

  bot.action(/notif_30m_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '30m', compromissoId);
  });

  bot.action(/notif_1h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '1h', compromissoId);
  });

  bot.action(/notif_5h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '5h', compromissoId);
  });

  bot.action(/notif_12h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '12h', compromissoId);
  });

  bot.action(/notif_24h_(.+)/, async (ctx) => {
    const compromissoId = ctx.match[1];
    await processarNotificacaoCompromisso(ctx, '24h', compromissoId);
  });

  // Editar dados do compromisso antes do registro
  bot.action('agenda_editar_dados', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      await ctx.editMessageText(
        'O que você deseja editar?',
        Markup.inlineKeyboard([
          [Markup.button.callback('Título', 'agenda_edit_titulo')],
          [Markup.button.callback('Descrição', 'agenda_edit_descricao')],
          [Markup.button.callback('Data', 'agenda_edit_data')],
          [Markup.button.callback('Hora', 'agenda_edit_hora')],
          [Markup.button.callback('Local', 'agenda_edit_local')],
          [Markup.button.callback('Voltar', 'agenda_voltar_confirmacao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao mostrar opções de edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Handlers para cada campo de edição
  bot.action('agenda_edit_titulo', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_titulo_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessions[0].id);
        
      await ctx.editMessageText('Digite o novo título para o compromisso:');
    } catch (error) {
      console.error('Erro ao editar título:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('agenda_edit_descricao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_descricao_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessions[0].id);
        
      await ctx.editMessageText('Digite a nova descrição para o compromisso (ou "pular" para remover):');
    } catch (error) {
      console.error('Erro ao editar descrição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('agenda_edit_data', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_data_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessions[0].id);
        
      await ctx.editMessageText('Digite a nova data do compromisso no formato DD/MM/YYYY:', 
        { reply_markup: { inline_keyboard: [] } }
      );
      
      await ctx.reply('Escolha uma opção ou digite a data:',
        Markup.keyboard([
          ['Hoje', 'Amanhã']
        ]).oneTime().resize()
      );
    } catch (error) {
      console.error('Erro ao editar data:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('agenda_edit_hora', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_hora_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessions[0].id);
        
      await ctx.editMessageText(
          'Digite o novo horário do compromisso no formato HH:MM:',
        { reply_markup: { inline_keyboard: [] } }
      );
      
      await ctx.reply('Digite o horário (exemplo: 14:30):',
        Markup.removeKeyboard()
      );
    } catch (error) {
      console.error('Erro ao editar hora:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action('agenda_edit_local', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_local_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('id', sessions[0].id);
        
      await ctx.editMessageText('Digite o novo local do compromisso (ou "pular" para remover):');
    } catch (error) {
      console.error('Erro ao editar local:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });  

  // Voltar para confirmação
  bot.action('agenda_voltar_confirmacao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      
      const dataHora = new Date(session.data.data_hora);
      const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const clienteInfo = session.data.nome_cliente 
        ? `Cliente: ${session.data.nome_cliente}\n`
        : '';
        
      await ctx.editMessageText(
        `📋 Confirme os dados do compromisso:\n\n` +
        `Título: ${session.data.titulo}\n` +
        `${clienteInfo}` +
        `Data: ${dataFormatada}\n` +
        (session.data.local ? `Local: ${session.data.local}\n` : '') +
        (session.data.descricao ? `Descrição: ${session.data.descricao}\n` : '') +
        `\nOs dados estão corretos?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
          [Markup.button.callback('✏️ Editar', 'agenda_editar_dados')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao voltar para confirmação:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Handler para edição de compromisso existente
  bot.action(/agenda_editar_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      const telegramId = ctx.from?.id;
      
      const { data: compromisso, error } = await adminSupabase
        .from('compromissos')
        .select(`
          *,
          clientes (
            nome_empresa
          )
        `)
        .eq('id', compromissoId)
        .single();
      
      if (error || !compromisso) {
        console.error('Erro ao buscar compromisso:', error);
        await ctx.reply('Erro ao buscar compromisso. Por favor, tente novamente.');
        return;
      }
      
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('telegram_id', telegramId);
        
      await adminSupabase
        .from('sessions')
        .insert([{
          telegram_id: telegramId,
          user_id: compromisso.user_id,
          command: 'agenda',
          step: 'editar_compromisso',
          data: {
            ...compromisso,
            nome_cliente: compromisso.clientes?.nome_empresa
          },
          updated_at: new Date().toISOString()
        }]);
      
      await ctx.reply(
        `O que você deseja editar no compromisso "${compromisso.titulo}"?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('Título', 'agenda_edit_titulo')],
          [Markup.button.callback('Descrição', 'agenda_edit_descricao')],
          [Markup.button.callback('Data', 'agenda_edit_data')],
          [Markup.button.callback('Hora', 'agenda_edit_hora')],
          [Markup.button.callback('Local', 'agenda_edit_local')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
    } catch (error) {
      console.error('Erro ao iniciar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Handler para concluir compromisso
  bot.action(/agenda_concluir_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      
      const { error } = await adminSupabase
        .from('compromissos')
        .update({
          status: 'concluido',
          updated_at: new Date().toISOString()
        })
        .eq('id', compromissoId);
      
      if (error) {
        console.error('Erro ao concluir compromisso:', error);
        await ctx.reply('Erro ao concluir compromisso. Por favor, tente novamente.');
        return;
      }
      
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('✅ Compromisso marcado como concluído!');
      
      return handleListarCompromissos(ctx);
    } catch (error) {
      console.error('Erro ao concluir compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Handler para cancelar compromisso
  bot.action(/agenda_cancelar_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      
      await ctx.reply(
        '⚠️ Tem certeza que deseja cancelar este compromisso?',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Sim, cancelar', `confirmar_cancelamento_${compromissoId}`),
            Markup.button.callback('❌ Não', 'voltar_compromissos')
          ]
        ])
      );
    } catch (error) {
      console.error('Erro ao processar cancelamento:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Confirmar cancelamento de compromisso
  bot.action(/confirmar_cancelamento_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      
      const { error } = await adminSupabase
        .from('compromissos')
        .update({
          status: 'cancelado',
          updated_at: new Date().toISOString()
        })
        .eq('id', compromissoId);
      
      if (error) {
        console.error('Erro ao cancelar compromisso:', error);
        await ctx.reply('Erro ao cancelar compromisso. Por favor, tente novamente.');
        return;
      }
      
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      await ctx.reply('❌ Compromisso cancelado!');
      
      return handleListarCompromissos(ctx);
    } catch (error) {
      console.error('Erro ao cancelar compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Voltar para lista de compromissos
  bot.action('voltar_compromissos', async (ctx) => {
    try {
      ctx.answerCbQuery();
      await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
      return handleListarCompromissos(ctx);
    } catch (error) {
      console.error('Erro ao voltar:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Callback para salvar alterações de compromisso editado
  bot.action('agenda_salvar_edicao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
          
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const compromissoData = session.data;
      
      if (!compromissoData.id) {
        console.error('ID do compromisso não encontrado na sessão');
        await ctx.reply('Erro: Compromisso não identificado. Por favor, tente novamente.');
        return;
      }
      
      // ✅ NOVO: Buscar dados originais para comparar se mudou data/hora
      const { data: compromissoOriginal, error: fetchError } = await adminSupabase
        .from('compromissos')
        .select('data_compromisso')
        .eq('id', compromissoData.id)
        .single();
        
      if (fetchError) {
        console.error('Erro ao buscar compromisso original:', fetchError);
        await ctx.reply('Erro ao verificar compromisso. Por favor, tente novamente.');
        return;
      }
      
      // ✅ VERIFICAR: Se data/hora foi alterada
      const dataOriginal = new Date(compromissoOriginal.data_compromisso).getTime();
      const dataAtualizada = new Date(compromissoData.data_compromisso).getTime();
      const dataHoraAlterada = dataOriginal !== dataAtualizada;
      
      console.log('=== DEBUG EDIÇÃO ===');
      console.log('Data original:', new Date(dataOriginal).toISOString());
      console.log('Data atualizada:', new Date(dataAtualizada).toISOString());
      console.log('Data/hora foi alterada:', dataHoraAlterada);
      console.log('==================');
      
      // ✅ ATUALIZAR: Compromisso no banco
      const { error: updateError } = await adminSupabase
        .from('compromissos')
        .update({
          titulo: compromissoData.titulo,
          descricao: compromissoData.descricao || null,
          data_compromisso: compromissoData.data_compromisso,
          local: compromissoData.local || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', compromissoData.id)
        .eq('user_id', session.user_id);
          
      if (updateError) {
        console.error('Erro ao atualizar compromisso:', updateError);
        await ctx.reply('Erro ao salvar alterações. Por favor, tente novamente.');
        return;
      }
      
      // ✅ LIMPAR: Sessão atual
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
      
      // ✅ DECISÃO: Se alterou data/hora, perguntar sobre notificação
      if (dataHoraAlterada) {
        // ✅ CANCELAR: Notificações antigas deste compromisso
        await adminSupabase
          .from('notificacoes')
          .update({ status: 'cancelado' })
          .eq('user_id', session.user_id)
          .eq('tipo', 'agenda')
          .like('mensagem', `%${compromissoData.titulo}%`)
          .eq('status', 'pendente');
        
        // ✅ REDIRECIONAR: Para configuração de notificações
        const { handleConfiguracoesNotificacao } = await import('./notifications');
        
        await ctx.editMessageText(
          `✅ Alterações salvas com sucesso!\n\n` +
          `📝 ${compromissoData.titulo}\n` +
          `📅 ${format(new Date(compromissoData.data_compromisso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n\n` +
          `⚠️ Como você alterou a data/horário, vamos configurar as notificações novamente.`
        );
        
        try {
          const { handleConfiguracoesNotificacao } = await import('./notifications');
          await handleConfiguracoesNotificacao(ctx, compromissoData.id);
        } catch (error) {
          console.error('Erro ao mostrar configurações de notificação:', error);
          await ctx.reply('Erro ao configurar notificações. Por favor, tente novamente.');
        }
        
      } else {
        // ✅ SÓ CONFIRMAR: Sucesso sem perguntar notificação
        await ctx.editMessageText(
          `✅ Alterações salvas com sucesso!\n\n` +
          `📝 ${compromissoData.titulo}\n` +
          `📅 ${format(new Date(compromissoData.data_compromisso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}\n` +
          (compromissoData.local ? `📍 ${compromissoData.local}\n` : '') +
          (compromissoData.nome_cliente ? `👥 ${compromissoData.nome_cliente}\n` : '') +
          (compromissoData.descricao ? `💬 ${compromissoData.descricao}` : ''),
          Markup.inlineKeyboard([
            [
              Markup.button.callback('📋 Listar Compromissos', 'agenda_listar'),
              Markup.button.callback('🏠 Menu Principal', 'menu_principal')
            ]
          ])
        );
      }
      
    } catch (error) {
      console.error('Erro ao salvar edição:', error);
      await ctx.reply('Ocorreu um erro ao salvar as alterações. Por favor, tente novamente.');
    }
  });

  // Callback para continuar editando
  bot.action('agenda_continuar_editando', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const compromissoData = session.data;
      
      await ctx.editMessageText(
        `O que você deseja editar no compromisso "${compromissoData.titulo}"?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('📝 Título', 'agenda_edit_titulo')],
          [Markup.button.callback('📄 Descrição', 'agenda_edit_descricao')],
          [Markup.button.callback('📅 Data', 'agenda_edit_data')],
          [Markup.button.callback('🕐 Hora', 'agenda_edit_hora')],
          [Markup.button.callback('📍 Local', 'agenda_edit_local')],
          [Markup.button.callback('✅ Finalizar Edição', 'agenda_finalizar_edicao')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
      
    } catch (error) {
      console.error('Erro ao continuar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // Callback para finalizar edição (mostrar confirmação)
  bot.action('agenda_finalizar_edicao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      const { data: sessions } = await adminSupabase
        .from('sessions')
        .select('*')
        .eq('telegram_id', telegramId)
        .limit(1);
        
      if (!sessions || sessions.length === 0) {
        return ctx.reply('Sessão expirada. Por favor, inicie novamente.');
      }
      
      const session = sessions[0];
      const compromissoData = session.data;
      
      // Mostrar confirmação final
      const dataFormatada = format(new Date(compromissoData.data_compromisso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const clienteInfo = compromissoData.nome_cliente 
        ? `Cliente: ${compromissoData.nome_cliente}\n`
        : '';
        
      await ctx.editMessageText(
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
      console.error('Erro ao finalizar edição:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });  

  // ✅ NOVO: Callback para paginação de compromissos
  bot.action(/agenda_pagina_(\d+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const pagina = parseInt(ctx.match[1]);
      const userId = ctx.state.user?.id;
      
      if (!userId) {
        return ctx.reply('Sessão expirada. Por favor, tente novamente.');
      }

      // Buscar todos os compromissos novamente
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

      if (error || !compromissos) {
        return ctx.reply('Erro ao carregar compromissos.');
      }

      // Mostrar página solicitada
      await mostrarCompromissosPaginados(ctx, compromissos, pagina);
      
    } catch (error) {
      console.error('Erro na paginação de compromissos:', error);
      await ctx.reply('Ocorreu um erro ao navegar.');
    }
  });

}
