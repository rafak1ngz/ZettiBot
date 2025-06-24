import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';
import { Markup } from 'telegraf';
import { Cliente } from '@/types/database';
import { validators } from '@/utils/validators';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Função de cancelamento
async function cancelarOperacao(ctx: BotContext, telegramId: number) {
  try {
    // Limpar qualquer sessão ativa
    const { error } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (error) {
      console.error('Erro ao limpar sessão:', error);
      return ctx.reply('Ocorreu um erro ao cancelar a operação.');
    }

    // Mensagem de cancelamento
    await ctx.reply(`
❌ Operação cancelada com sucesso!

Você pode começar uma nova ação digitando /inicio ou escolhendo uma opção no menu.
    `, 
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

export const conversationMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  // Se não for mensagem de texto ou for um comando, não processar como conversa
  if (!ctx.message || !('text' in ctx.message)) {
    return next();
  }
  
  // Verificar se é o comando /cancelar
  if (ctx.message.text.toLowerCase() === '/cancelar') {
    const telegramId = ctx.from?.id;
    if (telegramId) {
      await cancelarOperacao(ctx, telegramId);
      return; // Encerra o processamento após cancelar
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
        if (!validators.email(email)) {
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
          // ETAPAS DE CRIAÇÃO DE CLIENTE
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
            
            // Se for "pular", não precisa validar
            if (cnpj.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'contato_nome',
                  data: { 
                    ...session.data, 
                    cnpj: null
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Nome do contato na empresa:');
              return;
            }
            
            // Limpar CNPJ (remover formatação)
            const cnpjLimpo = cnpj.replace(/[^\d]/g, '');
            
            // Validar formato do CNPJ
            if (cnpjLimpo.length !== 14) {
              await ctx.reply('CNPJ inválido. Por favor, digite um CNPJ com 14 dígitos ou "pular".');
              return;
            }
            
            // Verificar se o CNPJ já existe para outro cliente do mesmo usuário
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
            
            // Verificar se encontrou algum cliente com o mesmo CNPJ
            const clienteAtual = session.data.id;
            const duplicados = clienteAtual 
              ? clientesExistentes?.filter(c => c.id !== clienteAtual)
              : clientesExistentes;
            
            if (duplicados && duplicados.length > 0) {
              await ctx.reply(`⚠️ Este CNPJ já está cadastrado para o cliente "${duplicados[0].nome_empresa}". Por favor, use outro CNPJ ou verifique se está cadastrando um cliente duplicado.`);
              return;
            }
            
            // CNPJ válido, continuar o fluxo
            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_nome',
                data: { 
                  ...session.data, 
                  cnpj: cnpjLimpo // Salva apenas números
                },
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
                data: { 
                  ...session.data, 
                  contato_nome: contatoNome 
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Telefone do contato (opcional, digite "pular" para continuar):');
            return;
          }

          case 'contato_telefone': {
            const telefone = ctx.message.text.trim();
            
            // Se for "pular", continuar
            if (telefone.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'contato_email',
                  data: { 
                    ...session.data, 
                    contato_telefone: null
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Email do contato (opcional, digite "pular" para continuar):');
              return;
            }
            
            // Limpar telefone (apenas números)
            const telefoneLimpo = telefone.replace(/[^\d]/g, '');
            
            // Validar formato do telefone
            if (!validators.telefone(telefoneLimpo)) {
              await ctx.reply('Telefone inválido. Por favor, digite um telefone com 10 ou 11 dígitos (DDD + número) ou "pular".');
              return;
            }

            await adminSupabase
              .from('sessions')
              .update({
                step: 'contato_email',
                data: { 
                  ...session.data, 
                  contato_telefone: telefoneLimpo // Salva apenas números
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            await ctx.reply('Email do contato (opcional, digite "pular" para continuar):');
            return;
          }

          case 'contato_email': {
            const email = ctx.message.text.trim();
            
            // Se for "pular", continuar
            if (email.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'observacoes',
                  data: { 
                    ...session.data, 
                    contato_email: null
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              await ctx.reply('Observações adicionais sobre o cliente (opcional, digite "pular" para continuar):');
              return;
            }

            // Validação de e-mail
            if (!validators.email(email)) {
              await ctx.reply('Por favor, digite um email válido ou "pular" para continuar.');
              return;
            }

            await adminSupabase
              .from('sessions')
              .update({
                step: 'observacoes',
                data: { 
                  ...session.data, 
                  contato_email: email
                },
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
                data: { 
                  ...session.data, 
                  observacoes: obsValue
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);

            // Formatar CNPJ e telefone para exibição
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
          
          // ETAPAS DE EDIÇÃO
          case 'edit_nome_empresa': {
            const novoNome = ctx.message.text.trim();
            
            if (!novoNome || novoNome.length < 2) {
              await ctx.reply('Por favor, forneça um nome de empresa válido.');
              return;
            }
            
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, nome_empresa: novoNome },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';
              
            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${novoNome}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'edit_cnpj': {
            const novoCnpj = ctx.message.text.trim();
            
            // Se for "pular", continuar
            if (novoCnpj.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  data: { ...session.data, cnpj: null },
                  step: 'confirmar',
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              // Formatar dados para exibição
              const telefoneExibicao = session.data.contato_telefone 
                ? validators.formatters.telefone(session.data.contato_telefone)
                : 'Não informado';

              await ctx.reply(
                `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
                `Empresa: ${session.data.nome_empresa}\n` +
                `CNPJ: Não informado\n` +
                `Contato: ${session.data.contato_nome}\n` +
                `Telefone: ${telefoneExibicao}\n` +
                `Email: ${session.data.contato_email || 'Não informado'}\n` +
                (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
                `\nOs dados estão corretos?`,
                Markup.inlineKeyboard([
                  [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                  [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                  [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
                ])
              );
              return;
            }
            
            // Limpar CNPJ (remover formatação)
            const cnpjLimpo = novoCnpj.replace(/[^\d]/g, '');
            
            // Validar formato do CNPJ
            if (cnpjLimpo.length !== 14) {
              await ctx.reply('CNPJ inválido. Por favor, digite um CNPJ com 14 dígitos ou "pular".');
              return;
            }
            
            // Verificar duplicação de CNPJ, exceto para o cliente atual
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
            
            // Filtrar o cliente atual da lista de possíveis duplicados
            const clienteAtual = session.data.id;
            const duplicados = clienteAtual 
              ? clientesExistentes?.filter(c => c.id !== clienteAtual)
              : clientesExistentes;
            
            if (duplicados && duplicados.length > 0) {
              await ctx.reply(`⚠️ Este CNPJ já está cadastrado para o cliente "${duplicados[0].nome_empresa}". Por favor, use outro CNPJ.`);
              return;
            }
            
            // CNPJ válido, continuar
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, cnpj: cnpjLimpo },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';
              
            const cnpjExibicao = validators.formatters.cnpj(cnpjLimpo);

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'edit_contato_nome': {
            const novoContato = ctx.message.text.trim();
            
            if (!novoContato || novoContato.length < 2) {
              await ctx.reply('Por favor, forneça um nome de contato válido.');
              return;
            }
            
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, contato_nome: novoContato },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';
              
            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${novoContato}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'edit_contato_telefone': {
            const novoTelefone = ctx.message.text.trim();
            
            // Se for "pular", continuar
            if (novoTelefone.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'confirmar',
                  data: { 
                    ...session.data, 
                    contato_telefone: null
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              // Formatar dados para exibição
              const cnpjExibicao = session.data.cnpj 
                ? validators.formatters.cnpj(session.data.cnpj)
                : 'Não informado';

              await ctx.reply(
                `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
                `Empresa: ${session.data.nome_empresa}\n` +
                `CNPJ: ${cnpjExibicao}\n` +
                `Contato: ${session.data.contato_nome}\n` +
                `Telefone: Não informado\n` +
                `Email: ${session.data.contato_email || 'Não informado'}\n` +
                (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
                `\nOs dados estão corretos?`,
                Markup.inlineKeyboard([
                  [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                  [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                  [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
                ])
              );
              return;
            }
            
            // Limpar telefone (apenas números)
            const telefoneLimpo = novoTelefone.replace(/[^\d]/g, '');
            
            // Validar formato do telefone
            if (!validators.telefone(telefoneLimpo)) {
              await ctx.reply('Telefone inválido. Por favor, digite um telefone com 10 ou 11 dígitos (DDD + número) ou "pular".');
              return;
            }
            
            await adminSupabase
              .from('sessions')
              .update({
                step: 'confirmar',
                data: { 
                  ...session.data, 
                  contato_telefone: telefoneLimpo
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = validators.formatters.telefone(telefoneLimpo);
            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'edit_contato_email': {
            const novoEmail = ctx.message.text.trim();
            
            // Se for "pular", continuar
            if (novoEmail.toLowerCase() === 'pular') {
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'confirmar',
                  data: { 
                    ...session.data, 
                    contato_email: null
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              // Formatar dados para exibição
              const telefoneExibicao = session.data.contato_telefone 
                ? validators.formatters.telefone(session.data.contato_telefone)
                : 'Não informado';
                
              const cnpjExibicao = session.data.cnpj 
                ? validators.formatters.cnpj(session.data.cnpj)
                : 'Não informado';

              await ctx.reply(
                `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
                `Empresa: ${session.data.nome_empresa}\n` +
                `CNPJ: ${cnpjExibicao}\n` +
                `Contato: ${session.data.contato_nome}\n` +
                `Telefone: ${telefoneExibicao}\n` +
                `Email: Não informado\n` +
                (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
                `\nOs dados estão corretos?`,
                Markup.inlineKeyboard([
                  [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                  [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                  [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
                ])
              );
              return;
            }

            // Validação de e-mail
            if (!validators.email(novoEmail)) {
              await ctx.reply('Por favor, digite um email válido ou "pular" para continuar.');
              return;
            }
            
            await adminSupabase
              .from('sessions')
              .update({
                step: 'confirmar',
                data: { 
                  ...session.data, 
                  contato_email: novoEmail
                },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';
              
            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${novoEmail}\n` +
              (session.data.observacoes ? `Observações: ${session.data.observacoes}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'edit_observacoes': {
            const novasObs = ctx.message.text.trim();
            const obsValue = (novasObs.toLowerCase() === 'pular') ? null : novasObs;
            
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, observacoes: obsValue },
                step: 'confirmar',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
            
            // Formatar dados para exibição
            const telefoneExibicao = session.data.contato_telefone 
              ? validators.formatters.telefone(session.data.contato_telefone)
              : 'Não informado';
              
            const cnpjExibicao = session.data.cnpj 
              ? validators.formatters.cnpj(session.data.cnpj)
              : 'Não informado';

            await ctx.reply(
              `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
              `Empresa: ${session.data.nome_empresa}\n` +
              `CNPJ: ${cnpjExibicao}\n` +
              `Contato: ${session.data.contato_nome}\n` +
              `Telefone: ${telefoneExibicao}\n` +
              `Email: ${session.data.contato_email || 'Não informado'}\n` +
              (obsValue ? `Observações: ${obsValue}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
                [Markup.button.callback('🔄 Editar', 'cliente_editar')],
                [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
              ])
            );
            return;
          }

          case 'confirmar': {
            // Este caso não será usado por texto, apenas por botões
            await ctx.reply('Por favor, use os botões abaixo para confirmar, editar ou cancelar.');
            return;
          }

          // ETAPAS DE BUSCA
          case 'buscar_nome_empresa': {
            const empresaNome = ctx.message.text.trim();
            
            try {
              const { data: clientes, error } = await adminSupabase
                .from('clientes')
                .select('*')
                .eq('user_id', session.user_id)
                .ilike('nome_empresa', `%${empresaNome}%`)
                .limit(5);
              
              if (error) {
                console.error('Erro na busca de clientes:', error);
                await ctx.reply('Ocorreu um erro ao buscar clientes.');
                return;
              }
              
              if (!clientes || clientes.length === 0) {
                await ctx.reply(`Nenhum cliente encontrado com o nome "${empresaNome}".`);
                return;
              }
              
              // Limpar sessão após busca
              await adminSupabase
                .from('sessions')
                .delete()
                .eq('id', session.id);
              
              // Primeiro envia uma mensagem com os resultados
              await ctx.reply(`🔍 Resultados da busca por "${empresaNome}":`);
              
              // Envia cada cliente como uma mensagem separada com botões
              for (const cliente of clientes) {
                // Formatar dados para exibição
                const telefoneExibicao = cliente.contato_telefone 
                  ? validators.formatters.telefone(cliente.contato_telefone)
                  : 'Não informado';
                  
                const cnpjExibicao = cliente.cnpj 
                  ? validators.formatters.cnpj(cliente.cnpj)
                  : 'Não informado';

                const mensagem = 
                  `📋 <b>${cliente.nome_empresa}</b>\n` +
                  `------------------------------------------\n` +
                  `📝 CNPJ: ${cnpjExibicao}\n` +
                  (cliente.contato_nome ? `👤 Contato: ${cliente.contato_nome}\n` : '') +
                  `📞 Telefone: ${telefoneExibicao}\n` +
                  (cliente.contato_email ? `✉️ Email: ${cliente.contato_email}\n` : '') +
                  (cliente.observacoes ? `📌 Obs: ${cliente.observacoes}\n` : '');
                
                await ctx.reply(mensagem, {
                  parse_mode: 'HTML',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('✏️ Editar Cliente', `editar_cliente_${cliente.id}`)],
                    [Markup.button.callback('🗑️ Excluir Cliente', `excluir_cliente_${cliente.id}`)]
                  ])
                });
              }
              
              // Finalizar com botões de navegação
              await ctx.reply('O que deseja fazer agora?', 
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔍 Nova Busca', 'clientes_buscar')],
                  [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
                ])
              );
              return;
            } catch (error) {
              console.error('Erro inesperado na busca:', error);
              await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
            }
            return;
          }

          case 'buscar_cnpj': {
            const cnpjBusca = ctx.message.text.trim();
            
            // Limpar CNPJ (apenas números)
            const cnpjLimpo = cnpjBusca.replace(/[^\d]/g, '');
            
            try {
              const { data: clientes, error } = await adminSupabase
                .from('clientes')
                .select('*')
                .eq('user_id', session.user_id)
                .eq('cnpj', cnpjLimpo)
                .limit(5);
              
              if (error) {
                console.error('Erro na busca de clientes:', error);
                await ctx.reply('Ocorreu um erro ao buscar clientes.');
                return;
              }
              
              if (!clientes || clientes.length === 0) {
                await ctx.reply(`Nenhum cliente encontrado com o CNPJ "${cnpjBusca}".`);
                return;
              }

              // Limpar sessão após busca
              await adminSupabase
                .from('sessions')
                .delete()
                .eq('id', session.id);
              
              // Primeiro envia uma mensagem com os resultados
              await ctx.reply(`🔍 Resultados da busca por CNPJ "${cnpjBusca}":`);

              // Envia cada cliente como uma mensagem separada com botões
              for (const cliente of clientes) {
                // Formatar dados para exibição
                const telefoneExibicao = cliente.contato_telefone 
                  ? validators.formatters.telefone(cliente.contato_telefone)
                  : 'Não informado';
                  
                const cnpjExibicao = cliente.cnpj 
                  ? validators.formatters.cnpj(cliente.cnpj)
                  : 'Não informado';

                const mensagem = 
                  `📋 <b>${cliente.nome_empresa}</b>\n` +
                  `------------------------------------------\n` +
                  `📝 CNPJ: ${cnpjExibicao}\n` +
                  (cliente.contato_nome ? `👤 Contato: ${cliente.contato_nome}\n` : '') +
                  `📞 Telefone: ${telefoneExibicao}\n` +
                  (cliente.contato_email ? `✉️ Email: ${cliente.contato_email}\n` : '') +
                  (cliente.observacoes ? `📌 Obs: ${cliente.observacoes}\n` : '');
                
                await ctx.reply(mensagem, {
                  parse_mode: 'HTML',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('✏️ Editar Cliente', `editar_cliente_${cliente.id}`)],
                    [Markup.button.callback('🗑️ Excluir Cliente', `excluir_cliente_${cliente.id}`)]
                  ])
                });
              }

              // Finalizar com botões de navegação
              await ctx.reply('O que deseja fazer agora?', 
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔍 Nova Busca', 'clientes_buscar')],
                  [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
                ])
              );
              return;
            } catch (error) {
              console.error('Erro inesperado na busca:', error);
              await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
            }
            return;
          }

          case 'buscar_contato': {
            const contatoBusca = ctx.message.text.trim();
            
            try {
              const { data: clientes, error } = await adminSupabase
                .from('clientes')
                .select('*')
                .eq('user_id', session.user_id)
                .ilike('contato_nome', `%${contatoBusca}%`)
                .limit(5);
              
              if (error) {
                console.error('Erro na busca de clientes:', error);
                await ctx.reply('Ocorreu um erro ao buscar clientes.');
                return;
              }
              
              if (!clientes || clientes.length === 0) {
                await ctx.reply(`Nenhum cliente encontrado com o contato "${contatoBusca}".`);
                return;
              }
              
              // Limpar sessão após busca
              await adminSupabase
                .from('sessions')
                .delete()
                .eq('id', session.id);
              
              // Primeiro envia uma mensagem com os resultados
              await ctx.reply(`🔍 Resultados da busca por contato "${contatoBusca}":`);
              
              // Envia cada cliente como uma mensagem separada com botões
              for (const cliente of clientes) {
                // Formatar dados para exibição
                const telefoneExibicao = cliente.contato_telefone 
                  ? validators.formatters.telefone(cliente.contato_telefone)
                  : 'Não informado';
                  
                const cnpjExibicao = cliente.cnpj 
                  ? validators.formatters.cnpj(cliente.cnpj)
                  : 'Não informado';

                const mensagem = 
                  `📋 <b>${cliente.nome_empresa}</b>\n` +
                  `------------------------------------------\n` +
                  `📝 CNPJ: ${cnpjExibicao}\n` +
                  (cliente.contato_nome ? `👤 Contato: ${cliente.contato_nome}\n` : '') +
                  `📞 Telefone: ${telefoneExibicao}\n` +
                  (cliente.contato_email ? `✉️ Email: ${cliente.contato_email}\n` : '') +
                  (cliente.observacoes ? `📌 Obs: ${cliente.observacoes}\n` : '');
                
                await ctx.reply(mensagem, {
                  parse_mode: 'HTML',
                  ...Markup.inlineKeyboard([
                    [Markup.button.callback('✏️ Editar Cliente', `editar_cliente_${cliente.id}`)],
                    [Markup.button.callback('🗑️ Excluir Cliente', `excluir_cliente_${cliente.id}`)]
                  ])
                });
              }
              
              // Finalizar com botões de navegação
              await ctx.reply('O que deseja fazer agora?', 
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔍 Nova Busca', 'clientes_buscar')],
                  [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
                ])
              );
              return;
            } catch (error) {
              console.error('Erro inesperado na busca:', error);
              await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
            }
            return;
          }
        }
      } catch (error) {
        console.error('Erro no processamento de cliente:', error);
        await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
      }
    }

    //=============================================================================
    // COMANDO: AGENDA - GERENCIAMENTO DE COMPROMISSOS
    //=============================================================================
    if (session.command === 'agenda') {
      try {
        switch (session.step) {
          case 'titulo_compromisso': {
            const titulo = ctx.message.text.trim();
            
            if (!titulo || titulo.length < 3) {
              await ctx.reply('Por favor, forneça um título válido para o compromisso.');
              return;
            }
            
            // Atualizar sessão para o próximo passo
            await adminSupabase
              .from('sessions')
              .update({
                step: 'descricao_compromisso',
                data: { ...session.data, titulo },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            await ctx.reply('Digite uma descrição para o compromisso (opcional, digite "pular" para continuar):');
            return;
          }
          
          case 'descricao_compromisso': {
            const descricao = ctx.message.text.trim();
            const descricaoValue = (descricao.toLowerCase() === 'pular') ? null : descricao;
            
            // Atualizar sessão para o próximo passo
            await adminSupabase
              .from('sessions')
              .update({
                step: 'data_compromisso',
                data: { ...session.data, descricao: descricaoValue },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            await ctx.reply(
              'Digite a data do compromisso no formato DD/MM/YYYY:',
              Markup.keyboard([
                ['Hoje', 'Amanhã']
              ]).oneTime().resize()
            );
            return;
          }
          
          case 'data_compromisso': {
            let dataTexto = ctx.message.text.trim();
            let data;
            
            // Processar atalhos
            if (dataTexto.toLowerCase() === 'hoje') {
              data = new Date();
              dataTexto = format(data, 'dd/MM/yyyy');
            } else if (dataTexto.toLowerCase() === 'amanhã') {
              data = new Date();
              data.setDate(data.getDate() + 1);
              dataTexto = format(data, 'dd/MM/yyyy');
            } else {
              // Validar formato da data
              try {
                data = parse(dataTexto, 'dd/MM/yyyy', new Date());
                
                // Verificar se é uma data válida
                if (isNaN(data.getTime())) {
                  await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
                  return;
                }
              } catch (error) {
                await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
                return;
              }
            }
            
            // Atualizar sessão para o próximo passo
            await adminSupabase
              .from('sessions')
              .update({
                step: 'hora_compromisso',
                data: { ...session.data, data_texto: dataTexto },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            await ctx.reply(
              'Digite o horário do compromisso no formato HH:MM:',
              Markup.removeKeyboard()
            );
            return;
          }
          
          case 'hora_compromisso': {
            const horaTexto = ctx.message.text.trim();
            
            // Validar formato da hora
            const horaRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!horaRegex.test(horaTexto)) {
              await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
              return;
            }
            
            // Atualizar sessão para o próximo passo
            await adminSupabase
              .from('sessions')
              .update({
                step: 'local_compromisso',
                data: { ...session.data, hora_texto: horaTexto },
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            await ctx.reply('Digite o local do compromisso (opcional, digite "pular" para continuar):');
            return;
          }
          
          case 'local_compromisso': {
            const local = ctx.message.text.trim();
            const localValue = (local.toLowerCase() === 'pular') ? null : local;
            
            // Construir data e hora completa
            try {
              const dataHoraTexto = `${session.data.data_texto} ${session.data.hora_texto}`;
              const dataHora = parse(dataHoraTexto, 'dd/MM/yyyy HH:mm', new Date());
              
              if (isNaN(dataHora.getTime())) {
                throw new Error('Data ou hora inválida');
              }
              
              // Atualizar sessão para confirmação
              await adminSupabase
                .from('sessions')
                .update({
                  step: 'confirmar_compromisso',
                  data: { 
                    ...session.data, 
                    local: localValue,
                    data_hora: dataHora.toISOString()
                  },
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              // Informações para exibição
              const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
              const clienteInfo = session.data.nome_cliente 
                ? `Cliente: ${session.data.nome_cliente}\n`
                : '';
                
              await ctx.reply(
                `📋 Confirme os dados do compromisso:\n\n` +
                `Título: ${session.data.titulo}\n` +
                `${clienteInfo}` +
                `Data: ${dataFormatada}\n` +
                (localValue ? `Local: ${localValue}\n` : '') +
                (session.data.descricao ? `Descrição: ${session.data.descricao}\n` : '') +
                `\nOs dados estão corretos?`,
                Markup.inlineKeyboard([
                  [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
                  [Markup.button.callback('✏️ Editar', 'agenda_editar_dados')],
                  [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
                ])
              );
            } catch (error) {
              console.error('Erro ao processar data/hora:', error);
              await ctx.reply('Ocorreu um erro ao processar a data e hora. Por favor, tente novamente.');
              
              // Limpar sessão em caso de erro
              await adminSupabase
                .from('sessions')
                .delete()
                .eq('id', session.id);
            }
            return;
          }
          
          case 'confirmar_compromisso': {
            await ctx.reply('Por favor, use os botões para confirmar ou cancelar o compromisso.');
            return;
          }

          case 'busca_cliente': {
            const termoBusca = ctx.message.text.trim();
            
            // Buscar clientes pelo nome
            const { data: clientes, error } = await adminSupabase
              .from('clientes')
              .select('id, nome_empresa')
              .eq('user_id', session.user_id)
              .ilike('nome_empresa', `%${termoBusca}%`)
              .limit(10);
            
            if (error) {
              console.error('Erro ao buscar clientes:', error);
              await ctx.reply('Ocorreu um erro ao buscar clientes. Por favor, tente novamente.');
              return;
            }
            
            if (!clientes || clientes.length === 0) {
              await ctx.reply(
                `Nenhum cliente encontrado com o termo "${termoBusca}".`,
                Markup.inlineKeyboard([
                  [Markup.button.callback('🔍 Nova Busca', 'agenda_vincular_cliente')],
                  [Markup.button.callback('➡️ Continuar sem Cliente', 'agenda_sem_cliente')],
                  [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
                ])
              );
              return;
            }
            
            // Criar botões para os clientes encontrados
            const clientesButtons = clientes.map(cliente => 
              [Markup.button.callback(cliente.nome_empresa, `agenda_cliente_${cliente.id}`)]
            );
            
            // Adicionar opções adicionais
            clientesButtons.push([Markup.button.callback('🔍 Nova Busca', 'agenda_vincular_cliente')]);
            clientesButtons.push([Markup.button.callback('➡️ Continuar sem Cliente', 'agenda_sem_cliente')]);
            clientesButtons.push([Markup.button.callback('❌ Cancelar', 'cancelar_acao')]);
            
            await ctx.reply(
              `Resultados da busca por "${termoBusca}":\nSelecione um cliente:`,
              Markup.inlineKeyboard(clientesButtons)
            );
            
            // Limpar a sessão após exibir os resultados
            await adminSupabase
              .from('sessions')
              .delete()
              .eq('id', session.id);
            
            return;
          }          

          case 'edit_titulo_compromisso': {
            const novoTitulo = ctx.message.text.trim();
            
            if (!novoTitulo || novoTitulo.length < 3) {
              await ctx.reply('Por favor, forneça um título válido para o compromisso.');
              return;
            }
            
            // Atualizar título na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, titulo: novoTitulo },
                step: 'confirmar_compromisso',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            // Construir data formatada
            const dataHora = new Date(session.data.data_hora);
            const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
            const clienteInfo = session.data.nome_cliente 
              ? `Cliente: ${session.data.nome_cliente}\n`
              : '';
              
            // Mostrar dados atualizados
            await ctx.reply(
              `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
              `Título: ${novoTitulo}\n` +
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
            return;
          }

          case 'edit_descricao_compromisso': {
            const novaDescricao = ctx.message.text.trim();
            const descricaoValue = (novaDescricao.toLowerCase() === 'pular') ? null : novaDescricao;
            
            // Atualizar descrição na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, descricao: descricaoValue },
                step: 'confirmar_compromisso',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            // Construir data formatada
            const dataHora = new Date(session.data.data_hora);
            const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
            const clienteInfo = session.data.nome_cliente 
              ? `Cliente: ${session.data.nome_cliente}\n`
              : '';
              
            // Mostrar dados atualizados
            await ctx.reply(
              `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
              `Título: ${session.data.titulo}\n` +
              `${clienteInfo}` +
              `Data: ${dataFormatada}\n` +
              (session.data.local ? `Local: ${session.data.local}\n` : '') +
              (descricaoValue ? `Descrição: ${descricaoValue}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
                [Markup.button.callback('✏️ Editar', 'agenda_editar_dados')],
                [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
              ])
            );
            return;
          }

          case 'edit_data_compromisso': {
            let dataTexto = ctx.message.text.trim();
            let data;
            
            // Processar atalhos
            if (dataTexto.toLowerCase() === 'hoje') {
              data = new Date();
              dataTexto = format(data, 'dd/MM/yyyy');
            } else if (dataTexto.toLowerCase() === 'amanhã') {
              data = new Date();
              data.setDate(data.getDate() + 1);
              dataTexto = format(data, 'dd/MM/yyyy');
            } else {
              // Validar formato da data
              try {
                data = parse(dataTexto, 'dd/MM/yyyy', new Date());
                
                // Verificar se é uma data válida
                if (isNaN(data.getTime())) {
                  await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
                  return;
                }
              } catch (error) {
                await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
                return;
              }
            }
            
            // Extrair a hora atual do compromisso
            const dataAtual = new Date(session.data.data_hora);
            const horaAtual = format(dataAtual, 'HH:mm');
            
            // Construir nova data e hora
            try {
              const novaDataHoraTexto = `${dataTexto} ${horaAtual}`;
              const novaDataHora = parse(novaDataHoraTexto, 'dd/MM/yyyy HH:mm', new Date());
              
              if (isNaN(novaDataHora.getTime())) {
                throw new Error('Data ou hora inválida');
              }
              
              // Atualizar data na sessão
              await adminSupabase
                .from('sessions')
                .update({
                  data: { 
                    ...session.data, 
                    data_texto: dataTexto,
                    data_hora: novaDataHora.toISOString() 
                  },
                  step: 'confirmar_compromisso',
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
                
              // Construir resposta
              const dataFormatada = format(novaDataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
              const clienteInfo = session.data.nome_cliente 
                ? `Cliente: ${session.data.nome_cliente}\n`
                : '';
                
              // Mostrar dados atualizados
              await ctx.reply(
                `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
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
              console.error('Erro ao processar data:', error);
              await ctx.reply('Ocorreu um erro ao processar a data. Por favor, tente novamente.');
            }
            return;
          }

          case 'edit_hora_compromisso': {
            const horaTexto = ctx.message.text.trim();
            
            // Validar formato da hora
            const horaRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
            if (!horaRegex.test(horaTexto)) {
              await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
              return;
            }
            
            try {
              // Obter a data atual do compromisso
              const dataAtual = new Date(session.data.data_hora);
              
              // Separar a hora e minuto fornecidos
              const [horas, minutos] = horaTexto.split(':').map(Number);
              
              // Criar nova data mantendo a data atual mas com o novo horário
              const novaData = new Date(dataAtual);
              novaData.setHours(horas);
              novaData.setMinutes(minutos);
              
              // Verificar se a data é válida
              if (isNaN(novaData.getTime())) {
                throw new Error('Data inválida');
              }
              
              // Atualizar sessão
              await adminSupabase
                .from('sessions')
                .update({
                  data: { 
                    ...session.data, 
                    data_hora: novaData.toISOString()
                  },
                  step: 'confirmar_compromisso',
                  updated_at: new Date().toISOString()
                })
                .eq('id', session.id);
              
              // Formatar para exibição
              const dataFormatada = format(novaData, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
              const clienteInfo = session.data.nome_cliente 
                ? `Cliente: ${session.data.nome_cliente}\n`
                : '';
              
              // Mostrar dados atualizados
              await ctx.reply(
                `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
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
              console.error('Erro ao processar hora:', error);
              await ctx.reply('Ocorreu um erro ao processar o horário. Por favor, tente novamente.');
            }
            return;
          }

          case 'edit_local_compromisso': {
            const novoLocal = ctx.message.text.trim();
            const localValue = (novoLocal.toLowerCase() === 'pular') ? null : novoLocal;
            
            // Atualizar local na sessão
            await adminSupabase
              .from('sessions')
              .update({
                data: { ...session.data, local: localValue },
                step: 'confirmar_compromisso',
                updated_at: new Date().toISOString()
              })
              .eq('id', session.id);
              
            // Construir data formatada
            const dataHora = new Date(session.data.data_hora);
            const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
            const clienteInfo = session.data.nome_cliente 
              ? `Cliente: ${session.data.nome_cliente}\n`
              : '';
              
            // Mostrar dados atualizados
            await ctx.reply(
              `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
              `Título: ${session.data.titulo}\n` +
              `${clienteInfo}` +
              `Data: ${dataFormatada}\n` +
              (localValue ? `Local: ${localValue}\n` : '') +
              (session.data.descricao ? `Descrição: ${session.data.descricao}\n` : '') +
              `\nOs dados estão corretos?`,
              Markup.inlineKeyboard([
                [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
                [Markup.button.callback('✏️ Editar', 'agenda_editar_dados')],
                [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
              ])
            );
            return;
          }

        }
      } catch (error) {
        console.error('Erro no processamento de agenda:', error);
        await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
      }
    }

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