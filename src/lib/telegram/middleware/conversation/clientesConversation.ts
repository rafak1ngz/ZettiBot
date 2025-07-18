import { BotContext } from '../session';
import { adminSupabase } from '@/lib/supabase';
import { validators } from '@/utils/validators';
import { Markup } from 'telegraf';

export async function handleClientesConversation(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;

  try {
    switch (session.step) {
      case 'nome_empresa': {
        return await handleNomeEmpresa(ctx, session);
      }
      case 'cnpj': {
        return await handleCnpj(ctx, session);
      }
      case 'contato_nome': {
        return await handleContatoNome(ctx, session);
      }
      case 'contato_telefone': {
        return await handleContatoTelefone(ctx, session);
      }
      case 'contato_email': {
        return await handleContatoEmail(ctx, session);
      }
      case 'observacoes': {
        return await handleObservacoes(ctx, session);
      }
      case 'confirmar': {
        await ctx.reply('Por favor, use os botões abaixo para confirmar, editar ou cancelar.');
        return;
      }
      // Etapas de edição
      case 'edit_nome_empresa': {
        return await handleEditNomeEmpresa(ctx, session);
      }
      case 'edit_cnpj': {
        return await handleEditCnpj(ctx, session);
      }
      case 'edit_contato_nome': {
        return await handleEditContatoNome(ctx, session);
      }
      case 'edit_contato_telefone': {
        return await handleEditContatoTelefone(ctx, session);
      }
      case 'edit_contato_email': {
        return await handleEditContatoEmail(ctx, session);
      }
      case 'edit_observacoes': {
        return await handleEditObservacoes(ctx, session);
      }
      // Etapas de busca
      case 'buscar_nome_empresa': {
        return await handleBuscarNomeEmpresa(ctx, session);
      }
      case 'buscar_cnpj': {
        return await handleBuscarCnpj(ctx, session);
      }
      case 'buscar_contato': {
        return await handleBuscarContato(ctx, session);
      }
      default: {
        console.log(`Unknown clientes step: ${session.step}`);
        return;
      }
    }
  } catch (error) {
    console.error('Erro no processamento de cliente:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// HANDLERS PARA CADASTRO DE CLIENTE
// ============================================================================

async function handleNomeEmpresa(ctx: BotContext, session: any) {
  const nomeEmpresa = ctx.message!.text.trim();
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
}

async function handleCnpj(ctx: BotContext, session: any) {
  const cnpj = ctx.message!.text.trim();
  
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
}

async function handleContatoNome(ctx: BotContext, session: any) {
  const contatoNome = ctx.message!.text.trim();

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
}

async function handleContatoTelefone(ctx: BotContext, session: any) {
  const telefone = ctx.message!.text.trim();
  
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
}

async function handleContatoEmail(ctx: BotContext, session: any) {
  const email = ctx.message!.text.trim();
  
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
}

async function handleObservacoes(ctx: BotContext, session: any) {
  const obs = ctx.message!.text.trim();
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
}

// ============================================================================
// HANDLERS PARA EDIÇÃO DE CLIENTE
// ============================================================================

async function handleEditNomeEmpresa(ctx: BotContext, session: any) {
  const novoNome = ctx.message!.text.trim();
  
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
  
  await mostrarConfirmacaoAtualizada(ctx, session.data, novoNome);
}

async function handleEditCnpj(ctx: BotContext, session: any) {
  const novoCnpj = ctx.message!.text.trim();
  
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
      
    await mostrarConfirmacaoAtualizada(ctx, { ...session.data, cnpj: null });
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
  
  await mostrarConfirmacaoAtualizada(ctx, { ...session.data, cnpj: cnpjLimpo });
}

// Continua com outros handlers de edição...
async function handleEditContatoNome(ctx: BotContext, session: any) {
  const novoContato = ctx.message!.text.trim();
  
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
  
  await mostrarConfirmacaoAtualizada(ctx, { ...session.data, contato_nome: novoContato });
}

async function handleEditContatoTelefone(ctx: BotContext, session: any) {
  const novoTelefone = ctx.message!.text.trim();
  
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
      
    await mostrarConfirmacaoAtualizada(ctx, { ...session.data, contato_telefone: null });
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
  
  await mostrarConfirmacaoAtualizada(ctx, { ...session.data, contato_telefone: telefoneLimpo });
}

async function handleEditContatoEmail(ctx: BotContext, session: any) {
  const novoEmail = ctx.message!.text.trim();
  
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
      
    await mostrarConfirmacaoAtualizada(ctx, { ...session.data, contato_email: null });
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
  
  await mostrarConfirmacaoAtualizada(ctx, { ...session.data, contato_email: novoEmail });
}

async function handleEditObservacoes(ctx: BotContext, session: any) {
  const novasObs = ctx.message!.text.trim();
  const obsValue = (novasObs.toLowerCase() === 'pular') ? null : novasObs;
  
  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, observacoes: obsValue },
      step: 'confirmar',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);
  
  await mostrarConfirmacaoAtualizada(ctx, { ...session.data, observacoes: obsValue });
}

// ============================================================================
// HANDLERS PARA BUSCA DE CLIENTE
// ============================================================================

async function handleBuscarNomeEmpresa(ctx: BotContext, session: any) {
  const empresaNome = ctx.message!.text.trim();
  
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
    
    await mostrarResultadosBusca(ctx, session, clientes, `"${empresaNome}"`);
  } catch (error) {
    console.error('Erro inesperado na busca:', error);
    await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}

async function handleBuscarCnpj(ctx: BotContext, session: any) {
  const cnpjBusca = ctx.message!.text.trim();
  
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

    await mostrarResultadosBusca(ctx, session, clientes, `CNPJ "${cnpjBusca}"`);
  } catch (error) {
    console.error('Erro inesperado na busca:', error);
    await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}

async function handleBuscarContato(ctx: BotContext, session: any) {
  const contatoBusca = ctx.message!.text.trim();
  
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
    
    await mostrarResultadosBusca(ctx, session, clientes, `contato "${contatoBusca}"`);
  } catch (error) {
    console.error('Erro inesperado na busca:', error);
    await ctx.reply('Ocorreu um erro inesperado. Por favor, tente novamente.');
  }
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

async function mostrarConfirmacaoAtualizada(ctx: BotContext, data: any, nomeEmpresa?: string) {
  const telefoneExibicao = data.contato_telefone 
    ? validators.formatters.telefone(data.contato_telefone)
    : 'Não informado';
    
  const cnpjExibicao = data.cnpj 
    ? validators.formatters.cnpj(data.cnpj)
    : 'Não informado';

  await ctx.reply(
    `📋 Verifique os dados ATUALIZADOS do cliente:\n\n` +
    `Empresa: ${nomeEmpresa || data.nome_empresa}\n` +
    `CNPJ: ${cnpjExibicao}\n` +
    `Contato: ${data.contato_nome}\n` +
    `Telefone: ${telefoneExibicao}\n` +
    `Email: ${data.contato_email || 'Não informado'}\n` +
    (data.observacoes ? `Observações: ${data.observacoes}\n` : '') +
    `\nOs dados estão corretos?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmar e Salvar', 'cliente_confirmar')],
      [Markup.button.callback('🔄 Editar', 'cliente_editar')],
      [Markup.button.callback('❌ Cancelar', 'cliente_cancelar')]
    ])
  );
}

async function mostrarResultadosBusca(ctx: BotContext, session: any, clientes: any[], termoBusca: string) {
  // Limpar sessão após busca
  await adminSupabase
    .from('sessions')
    .delete()
    .eq('id', session.id);
  
  // Primeiro envia uma mensagem com os resultados
  await ctx.reply(`🔍 Resultados da busca por ${termoBusca}:`);
  
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
}