import { Telegraf } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import {
  handleAgenda,
  handleNovoCompromisso,
  handleVincularCliente,
  handleSemCliente,
  handleListarCompromissos,
  handleSelecionarCliente,
  handleEditarCompromisso
} from './handlers';

// ============================================================================
// REGISTRAR TODOS OS COMANDOS E CALLBACKS DE AGENDA
// ============================================================================
export function registerAgendaCommands(bot: Telegraf) {
  
  // ========================================================================
  // COMANDO PRINCIPAL
  // ========================================================================
  bot.command('agenda', handleAgenda);

  // ========================================================================
  // CALLBACKS DO MENU PRINCIPAL
  // ========================================================================
  bot.action('menu_agenda', (ctx) => {
    ctx.answerCbQuery();
    return handleAgenda(ctx);
  });

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

  // ========================================================================
  // CALLBACKS DE SELEÇÃO DE CLIENTE
  // ========================================================================
  bot.action(/agenda_cliente_(.+)/, (ctx) => {
    ctx.answerCbQuery();
    const clienteId = ctx.match[1];
    return handleSelecionarCliente(ctx, clienteId);
  });

  // ========================================================================
  // CALLBACKS DE CONFIRMAÇÃO
  // ========================================================================
  bot.action('agenda_confirmar', async (ctx) => {
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
      
      // Inserir compromisso no banco
      const { error: insertError } = await adminSupabase
        .from('compromissos')
        .insert({
          user_id: session.user_id,
          cliente_id: session.data.cliente_id,
          titulo: session.data.titulo,
          descricao: session.data.descricao,
          data_compromisso: session.data.data_compromisso,
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
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '➕ Novo Compromisso', callback_data: 'agenda_novo' },
                { text: '📋 Listar Compromissos', callback_data: 'agenda_listar' }
              ],
              [{ text: '🏠 Menu Principal', callback_data: 'menu_principal' }]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Erro ao confirmar compromisso:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  // ========================================================================
  // CALLBACKS DE EDIÇÃO - CAMPOS ESPECÍFICOS
  // ========================================================================
  bot.action('agenda_edit_titulo', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_titulo_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      await ctx.editMessageText('Digite o novo título para o compromisso:');
    } catch (error) {
      console.error('Erro ao editar título:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  bot.action('agenda_edit_descricao', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_descricao_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      await ctx.editMessageText('Digite a nova descrição para o compromisso (ou "pular" para remover):');
    } catch (error) {
      console.error('Erro ao editar descrição:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  bot.action('agenda_edit_data', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_data_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      await ctx.editMessageText('Digite a nova data do compromisso no formato DD/MM/YYYY:');
    } catch (error) {
      console.error('Erro ao editar data:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  bot.action('agenda_edit_hora', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_hora_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      await ctx.editMessageText('Digite o novo horário do compromisso no formato HH:MM:');
    } catch (error) {
      console.error('Erro ao editar hora:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  bot.action('agenda_edit_local', async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      
      await adminSupabase
        .from('sessions')
        .update({
          step: 'edit_local_compromisso',
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', telegramId);
        
      await ctx.editMessageText('Digite o novo local do compromisso (ou "pular" para remover):');
    } catch (error) {
      console.error('Erro ao editar local:', error);
      await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    }
  });

  // ========================================================================
  // CALLBACKS DE EDIÇÃO DE COMPROMISSO EXISTENTE
  // ========================================================================
  bot.action(/agenda_editar_([0-9a-fA-F-]+)/, (ctx) => {
    ctx.answerCbQuery();
    const compromissoId = ctx.match[1];
    return handleEditarCompromisso(ctx, compromissoId);
  });

  // ========================================================================
  // CALLBACKS DE AÇÕES NO COMPROMISSO
  // ========================================================================
  bot.action(/agenda_concluir_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      const userId = ctx.state.user?.id;
      
      if (!userId) {
        return ctx.reply('Usuário não identificado.');
      }
      
      // Atualizar status do compromisso
      const { error } = await adminSupabase
        .from('compromissos')
        .update({
          status: 'concluido',
          updated_at: new Date().toISOString()
        })
        .eq('id', compromissoId)
        .eq('user_id', userId);
      
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

  bot.action(/agenda_cancelar_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      
      // Pedir confirmação
      await ctx.reply(
        '⚠️ Tem certeza que deseja cancelar este compromisso?',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Sim, cancelar', callback_data: `confirmar_cancelamento_${compromissoId}` },
                { text: '❌ Não', callback_data: 'voltar_compromissos' }
              ]
            ]
          }
        }
      );
    } catch (error) {
      console.error('Erro ao processar cancelamento:', error);
      await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
    }
  });

  bot.action(/confirmar_cancelamento_([0-9a-fA-F-]+)/, async (ctx) => {
    try {
      ctx.answerCbQuery();
      
      const compromissoId = ctx.match[1];
      const userId = ctx.state.user?.id;
      
      if (!userId) {
        return ctx.reply('Usuário não identificado.');
      }
      
      // Atualizar status do compromisso
      const { error } = await adminSupabase
        .from('compromissos')
        .update({
          status: 'cancelado',
          updated_at: new Date().toISOString()
        })
        .eq('id', compromissoId)
        .eq('user_id', userId);
      
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