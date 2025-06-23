import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';
import { Markup } from 'telegraf';

export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Se não for mensagem de texto ou for um comando, não processar como conversa
  if (!ctx.message || !('text' in ctx.message) || ctx.message.text.startsWith('/')) {
    return next();
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  try {
    console.log(`Checking for active conversations for telegramId: ${telegramId}`);

    // Verificar se há uma sessão ativa para este usuário
    const { data: sessions, error } = await adminSupabase
      .from('sessions')
      .select('*')
      .eq('telegram_id', telegramId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching session:', error);
      return next();
    }

    if (!sessions || sessions.length === 0) {
      console.log('No active session found');
      return next();
    }

    const session = sessions[0];
    console.log(`Found active session: command=${session.command}, step=${session.step}`);

    //=============================================================================
    // COMANDO: START - GERENCIAMENTO DE USUÁRIOS
    //=============================================================================
    if (session.command === 'start') {
      // Processamento do comando de início
      if (session.step === 'email') {
        const email = ctx.message.text;
        
        // Validar formato de email
        if (!email.includes('@') || !email.includes('.')) {
          await ctx.reply('Por favor, forneça um email válido no formato exemplo@dominio.com');
          return;
        }
        
        console.log(`Updating email for user ${session.user_id} to ${email}`);
        
        // Atualizar email do usuário
        const { error: updateError } = await adminSupabase
          .from('users')
          .update({ email })
          .eq('id', session.user_id);
          
        if (updateError) {
          console.error('Error updating email:', updateError);
          await ctx.reply('Ocorreu um erro ao salvar seu email. Por favor, tente novamente.');
          return;
        }
        
        // Excluir a sessão após processamento
        await adminSupabase
          .from('sessions')
          .delete()
          .eq('id', session.id);
        
        // Dar feedback e encerrar conversa
        await ctx.reply(`
Email registrado com sucesso! ✅

Agora você está pronto para usar todas as funcionalidades do ZettiBot.

👉 Digite /ajuda para conhecer os comandos disponíveis.
        `);
        
        return;
      }
    }
    
    //=============================================================================
    // COMANDO: CLIENTES - GERENCIAMENTO DE CLIENTES
    //=============================================================================
    if (session.command === 'clientes') {
      try {
        switch (session.step) {
          case 'nome_empresa':
            // Validar e salvar nome da empresa
            const nomeEmpresa = ctx.message.text;
            if (!nomeEmpresa || nomeEmpresa.length < 2) {
              await ctx.reply('Por favor, forneça um nome de empresa válido.');
              return;
            }

            // Atualizar sessão
            await adminSupabase
              .from('sessions')
              .update({
                step: 'cnpj',
                data: { ...session.data, nome_empresa: nomeEmpresa },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Digite o CNPJ da empresa (opcional, digite "pular" para continuar):');
            return;

          case 'cnpj':
            const cnpj = ctx.message.text.trim();
            
            // Atualizar sessão
            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_nome',
                data: { 
                  ...session.data, 
                  cnpj: (cnpj.toLowerCase() === 'pular') ? null : cnpj 
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Nome do contato na empresa:');
            return;

          case 'contato_nome':
            const contatoNome = ctx.message.text;

            // Atualizar sessão
            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_telefone',
                data: { 
                  ...session.data, 
                  contato_nome: contatoNome 
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Telefone do contato (opcional, digite "pular" para continuar):');
            return;

          case 'contato_telefone':
            const telefone = ctx.message.text.trim();
            const telefoneValue = (telefone.toLowerCase() === 'pular') ? null : telefone;

            // Atualizar sessão para confirmar antes de finalizar
            await adminSupabase
              .from('sessions')
              .update({
                step: 'confirmar',
                data: { 
                  ...session.data, 
                  contato_telefone: telefoneValue
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            // Mostrar resumo e solicitar confirmação
            await ctx.reply(
              `📋 Verifique os dados do cliente a ser cadastrado:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${session.data.cnpj || 'Não informado'}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneValue || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;

          // Etapas de edição
          case 'edit_nome_empresa':
            // Atualizar nome da empresa
            const novoNome = ctx.message.text.trim();
            
            if (!novoNome || novoNome.length < 2) {
              await ctx.reply('Por favor, forneça um nome de empresa válido.');
              return;
            }
            
            // Atualizar dados na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, nome_empresa: novoNome },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Mostrar dados atualizados para confirmação
            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${novoNome}\n` +
              `CNPJ: ${session.data.cnpj || 'Não informado'}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${session.data.contato_telefone || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;

          case 'edit_cnpj':
            // Atualizar CNPJ
            const novoCnpj = ctx.message.text.trim();
            const cnpjValue = (novoCnpj.toLowerCase() === 'pular') ? null : novoCnpj;
            
            // Atualizar dados na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, cnpj: cnpjValue },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Mostrar dados atualizados para confirmação
            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjValue || 'Não informado'}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${session.data.contato_telefone || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;

          case 'edit_contato_nome':
            // Atualizar nome do contato
            const novoContato = ctx.message.text.trim();
            
            // Atualizar dados na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, contato_nome: novoContato },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Mostrar dados atualizados para confirmação
            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${session.data.cnpj || 'Não informado'}\n` +
              `Contato: ${novoContato}\n` +
              `Telefone: ${session.data.contato_telefone || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;

          case 'edit_contato_telefone':
            // Atualizar telefone
            const novoTelefone = ctx.message.text.trim();
            const telefoneEditValue = (novoTelefone.toLowerCase() === 'pular') ? null : novoTelefone;
            
            // Atualizar dados na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, contato_telefone: telefoneEditValue },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Mostrar dados atualizados para confirmação
            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${session.data.cnpj || 'Não informado'}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneEditValue || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;

          case 'confirmar':
            // Este caso não será usado por texto, apenas por botões
            await ctx.reply('Por favor, use os botões abaixo para confirmar, editar ou cancelar.');
            return;
        }
        
      } catch (error) {
        console.error('Erro no processamento de cliente:', error);
        await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
      }
    }   

    //=============================================================================
    // COMANDO: AGENDA - GERENCIAMENTO DE COMPROMISSOS
    //=============================================================================
    /* 
    if (session.command === 'agenda') {
      // Implementação futura para compromissos
    }
    */
    
    //=============================================================================
    // COMANDO: FOLLOWUP - GERENCIAMENTO DE FOLLOW-UPS
    //=============================================================================
    /*
    if (session.command === 'followup') {
      // Implementação futura para follow-ups
    }
    */
    
    //=============================================================================
    // COMANDO: LEMBRETE - GERENCIAMENTO DE LEMBRETES
    //=============================================================================
    /*
    if (session.command === 'lembrete') {
      // Implementação futura para lembretes
    }
    */
    
  } catch (error) {
    console.error('Error in conversation middleware:', error);
    await ctx.reply('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
  }

  return next();
};