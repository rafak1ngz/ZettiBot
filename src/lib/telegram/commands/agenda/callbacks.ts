import { Telegraf, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  handleNovoCompromisso, 
  handleVincularCliente,
  handleSemCliente,
  handleListarCompromissos,
  handleSelecionarCliente
} from './handlers';

export function registerAgendaCallbacks(bot: Telegraf) {
  // Callbacks para o menu da agenda
  bot.action('agenda_novo', handleNovoCompromisso);
  bot.action('agenda_vincular_cliente', handleVincularCliente);
  bot.action('agenda_sem_cliente', handleSemCliente);
  bot.action('agenda_listar', handleListarCompromissos);
  
  bot.action(/agenda_cliente_(.+)/, (ctx) => {
    const clienteId = ctx.match[1];
    return handleSelecionarCliente(ctx, clienteId);
  });  

  // Confirmação de compromisso
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
      const { error: insertError } = await adminSupabase
        .from('compromissos')
        .insert({
          user_id: session.user_id,
          cliente_id: session.data.cliente_id,
          titulo: session.data.titulo,
          descricao: session.data.descricao,
          data_compromisso: session.data.data_compromisso || session.data.data_hora, // usar qualquer um dos dois
          local: session.data.local,
          status: 'pendente',
          updated_at: new Date().toISOString()
        });
        
      if (insertError) {
        console.error('Erro ao inserir compromisso:', insertError);
        await ctx.reply('Ocorreu um erro ao salvar o compromisso. Por favor, tente novamente.');
        return;
      }
      
      // Limpar sessão
      await adminSupabase
        .from('sessions')
        .delete()
        .eq('id', session.id);
        
      // Feedback de sucesso
      await ctx.editMessageText(
        '✅ Compromisso registrado com sucesso!\n\nO que deseja fazer agora?',
        Markup.inlineKeyboard([
          [
            Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
            Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
    } catch (error) {
      console.error('Erro ao confirmar compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
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
      
      // Atualizar sessão para editar título
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
      
      // Atualizar sessão para editar descrição
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
      
      // Atualizar sessão para editar data
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
        
      // Edite a mensagem original sem teclado
      await ctx.editMessageText('Digite a nova data do compromisso no formato DD/MM/YYYY:', 
        { reply_markup: { inline_keyboard: [] } }
      );
      
      // Envie uma nova mensagem com botões de teclado
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
      
      // Atualizar sessão para editar hora
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
      
      // Se necessário, envie uma nova mensagem removendo o teclado
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
      
      // Atualizar sessão para editar local
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
      
      // Obter a sessão atual
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
      
      // Construir data formatada
      const dataHora = new Date(session.data.data_hora);
      const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const clienteInfo = session.data.nome_cliente 
        ? `Cliente: ${session.data.nome_cliente}\n`
        : '';
        
      // Atualizar mensagem com os dados atualizados
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

  // Handler para edição de compromisso
  bot.action(/agenda_editar_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      const telegramId = ctx.from?.id;
      
      // Buscar o compromisso
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
      
      // Armazenar dados do compromisso em uma sessão
      await adminSupabase
        .from('sessions')
        .delete() // Limpar sessões antigas
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
      
      // Mostrar opções de edição
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
      
      // Atualizar status do compromisso
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
      
      // Mostrar lista atualizada
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
      
      // Pedir confirmação
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
      
      // Atualizar status do compromisso
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
      
      // Mostrar lista atualizada
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
}