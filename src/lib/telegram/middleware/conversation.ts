import { MiddlewareFn } from 'telegraf';
import { BotContext } from './session';
import { adminSupabase } from '@/lib/supabase';
import { Markup } from 'telegraf';
import { Cliente } from '@/types/database';
import { validators } from '@/utils/validators';

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