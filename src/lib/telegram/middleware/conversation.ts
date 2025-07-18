import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';
import { Markup } from 'telegraf';
import { validators } from '@/utils/validators';
import { processAgendaConversation } from './conversation/agendaConversation';

// ============================================================================
// FUNÇÃO DE CANCELAMENTO
// ============================================================================
async function cancelarOperacao(ctx: BotContext, telegramId: number) {
  try {
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Erro ao limpar sessão:', error);
      return ctx.reply('Ocorreu um erro ao cancelar a operação.');
    }

    await ctx.reply(`❌ Operação cancelada com sucesso!

Você pode começar uma nova ação digitando /inicio ou escolhendo uma opção no menu.`, 
    Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
    ]));
    
    return true;
  } catch (error) {
    console.error('Erro inesperado no cancelamento:', error);
    await ctx.reply('Ocorreu um erro ao cancelar a operação.');
    return false;
  }
}

// ============================================================================
// MIDDLEWARE PRINCIPAL
// ============================================================================
export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Verificar se é mensagem de texto
  if (!ctx.message || !('text' in ctx.message)) {
    return next();
  }
  
  // Verificar se é comando /cancelar
  if (ctx.message.text.toLowerCase() === '/cancelar') {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      await cancelarOperacao(ctx, telegramId);
      return;
    }
  }
  
  // Verificar se é outro comando
  if (ctx.message.text.startsWith('/')) {
    return next();
  }

  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  try {
    console.log(`Checking for active conversations for telegramId: ${telegramId}`);

    // Verificar se há uma sessão ativa
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

    // ========================================================================
    // COMANDO: START - GERENCIAMENTO DE USUÁRIOS
    // ========================================================================
    if (session.command === 'start') {
      if (session.step === 'email') {
        const email = ctx.message.text;
        
        if (!validators.email(email)) {
          await ctx.reply('Por favor, forneça um email válido no formato exemplo@dominio.com');
          return;
        }
        
        console.log(`Updating email for user ${session.user_id} to ${email}`);
        
        const { error: updateError } = await adminSupabase
          .from('users')
          .update({ email })
          .eq('id', session.user_id);
          
        if (updateError) {
          console.error('Error updating email:', updateError);
          await ctx.reply('Ocorreu um erro ao salvar seu email. Por favor, tente novamente.');
          return;
        }
        
        await adminSupabase
          .from('sessions')
          .delete()
          .eq('id', session.id);
        
        await ctx.reply(`Email registrado com sucesso! ✅

Agora você está pronto para usar todas as funcionalidades do ZettiBot.

👉 Digite /ajuda para conhecer os comandos disponíveis.`);
        
        return;
      }
    }
    
    // ========================================================================
    // COMANDO: AGENDA - GERENCIAMENTO DE COMPROMISSOS
    // ========================================================================
    if (session.command === 'agenda') {
      const processed = await processAgendaConversation(ctx, session);
      if (processed) {
        return; // Processado com sucesso
      }
    }
    
    // ========================================================================
    // COMANDO: CLIENTES - GERENCIAMENTO DE CLIENTES (MANTIDO ORIGINAL)
    // ========================================================================
    if (session.command === 'clientes') {
      try {
        switch (session.step) {
          case 'nome_empresa': {
            const nomeEmpresa = ctx.message.text.trim();
            if (!nomeEmpresa || nomeEmpresa.length < 2) {
              await ctx.reply('Por favor, forneça um nome de empresa válido.');
              return;
            }

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
          }

          case 'cnpj': {
            const cnpj = ctx.message.text.trim();
            
            if (cnpj.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'contato_nome',
                  data: { ...session.data, cnpj: null },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Nome do contato na empresa:');
              return;
            }
            
            const cnpjLimpo = cnpj.replace(/[^\d]/g, '');
            
            if (cnpjLimpo.length !== 14) {
              await ctx.reply('CNPJ inválido. Por favor, digite um CNPJ com 14 dígitos ou "pular".');
              return;
            }
            
            // Verificar duplicação
            const { data: clientesExistentes, error } = await adminSupabase
              .from('clientes')
              .select('id, nome_empresa')
              .eq('user_id', session.user_id)
              .eq('cnpj', cnpjLimpo);
              
            if (error) {
              console.error('Erro ao verificar duplicação de CNPJ:', error);
              await ctx.reply('Ocorreu um erro ao validar o CNPJ. Por favor, tente novamente.');
              return;
            }
            
            const clienteAtual = session.data.id;
            const duplicados = clienteAtual 
              ? clientesExistentes?.filter(c => c.id !== clienteAtual)
              : clientesExistentes;
            
            if (duplicados && duplicados.length > 0) {
              await ctx.reply(`⚠️ Este CNPJ já está cadastrado para o cliente "${duplicados[0].nome_empresa}". Por favor, use outro CNPJ ou verifique se está cadastrando um cliente duplicado.`);
              return;
            }
            
            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_nome',
                data: { ...session.data, cnpj: cnpjLimpo },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Nome do contato na empresa:');
            return;
          }

          case 'contato_nome': {
            const contatoNome = ctx.message.text.trim();

            if (!contatoNome || contatoNome.length < 2) {
              await ctx.reply('Por favor, forneça um nome de contato válido.');
              return;
            }

            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_telefone',
                data: { ...session.data, contato_nome: contatoNome },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Telefone do contato (opcional, digite "pular" para continuar):');
            return;
          }

          case 'contato_telefone': {
            const telefone = ctx.message.text.trim();
            
            if (telefone.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'contato_email',
                  data: { ...session.data, contato_telefone: null },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Email do contato (opcional, digite "pular" para continuar):');
              return;
            }
            
            const telefoneLimpo = telefone.replace(/[^\d]/g, '');
            
            if (!validators.telefone(telefoneLimpo)) {
              await ctx.reply('Telefone inválido. Por favor, digite um telefone com 10 ou 11 dígitos (DDD + número) ou "pular".');
              return;
            }

            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_email',
                data: { ...session.data, contato_telefone: telefoneLimpo },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Email do contato (opcional, digite "pular" para continuar):');
            return;
          }

          case 'contato_email': {
            const email = ctx.message.text.trim();
            
            if (email.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'observacoes',
                  data: { ...session.data, contato_email: null },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Observações adicionais sobre o cliente (opcional, digite "pular" para continuar):');
              return;
            }

            if (!validators.email(email)) {
              await ctx.reply('Por favor, digite um email válido ou "pular" para continuar.');
              return;
            }

            await adminSupabase
              .from('sessions')
              .update({
                step: 'observacoes',
                data: { ...session.data, contato_email: email },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Observações adicionais sobre o cliente (opcional, digite "pular" para continuar):');
            return;
          }

          case 'observacoes': {
            const obs = ctx.message.text.trim();
            const obsValue = (obs.toLowerCase() === 'pular') ? null : obs;

            await adminSupabase
              .from('sessions')
              .update({
                step: 'confirmar',
                data: { ...session.data, observacoes: obsValue },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';
              
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados do cliente a ser cadastrado:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              `Observações: ${obsValue || 'Não informado'}\n\n` +
              `Os dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          // Manter todos os outros cases de clientes que já funcionam...
          // (cases de edição, busca, etc.)

          default:
            return next();
        }
      } catch (error) {
        console.error('Erro no processamento de clientes:', error);
        await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
      }
    }

  } catch (error) {
    console.error('Error in conversation middleware:', error);
    await ctx.reply('Ocorreu um erro ao processar sua resposta. Por favor, tente novamente.');
  }

  return next();
};