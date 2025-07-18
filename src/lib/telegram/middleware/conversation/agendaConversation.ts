import { BotContext } from '../session';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Markup } from 'telegraf';

export async function handleAgendaConversation(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;

  try {
    switch (session.step) {
      case 'titulo_compromisso': {
        return await handleTituloCompromisso(ctx, session);
      }
      case 'descricao_compromisso': {
        return await handleDescricaoCompromisso(ctx, session);
      }
      case 'data_compromisso': {
        return await handleDataCompromisso(ctx, session);
      }
      case 'hora_compromisso': {
        return await handleHoraCompromisso(ctx, session);
      }
      case 'local_compromisso': {
        return await handleLocalCompromisso(ctx, session);
      }
      case 'confirmar_compromisso': {
        await ctx.reply('Por favor, use os botões para confirmar ou cancelar o compromisso.');
        return;
      }
      case 'busca_cliente': {
        return await handleBuscaCliente(ctx, session);
      }
      // Etapas de edição
      case 'edit_titulo_compromisso': {
        return await handleEditTituloCompromisso(ctx, session);
      }
      case 'edit_descricao_compromisso': {
        return await handleEditDescricaoCompromisso(ctx, session);
      }
      case 'edit_data_compromisso': {
        return await handleEditDataCompromisso(ctx, session);
      }
      case 'edit_hora_compromisso': {
        return await handleEditHoraCompromisso(ctx, session);
      }
      case 'edit_local_compromisso': {
        return await handleEditLocalCompromisso(ctx, session);
      }
      default: {
        console.log(`Unknown agenda step: ${session.step}`);
        return;
      }
    }
  } catch (error) {
    console.error('Erro no processamento de agenda:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// HANDLERS PARA CADASTRO DE COMPROMISSO
// ============================================================================

async function handleTituloCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

async function handleDescricaoCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

async function handleDataCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

async function handleHoraCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

async function handleLocalCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

async function handleBuscaCliente(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
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
}

// ============================================================================
// HANDLERS PARA EDIÇÃO DE COMPROMISSO
// ============================================================================

async function handleEditTituloCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const novoTitulo = ctx.message.text.trim();
  
  if (!novoTitulo || novoTitulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido para o compromisso.');
    return;
  }
  
  try {
    await adminSupabase
      .from('sessions')
      .update({
        data: { 
          ...session.data, 
          titulo: novoTitulo,
          data_hora: session.data.data_compromisso 
        },
        step: 'confirmar_compromisso',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
    
    await mostrarConfirmacaoCompromisso(ctx, { 
      ...session.data, 
      titulo: novoTitulo 
    });
  } catch (error) {
    console.error('Erro ao processar título:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

async function handleEditDescricaoCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const novaDescricao = ctx.message.text.trim();
  const descricaoValue = (novaDescricao.toLowerCase() === 'pular') ? null : novaDescricao;
  
  try {
    await adminSupabase
      .from('sessions')
      .update({
        data: { 
          ...session.data, 
          descricao: descricaoValue,
          data_hora: session.data.data_compromisso
        },
        step: 'confirmar_compromisso',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
      
    await mostrarConfirmacaoCompromisso(ctx, { 
      ...session.data, 
      descricao: descricaoValue 
    });
  } catch (error) {
    console.error('Erro ao processar descrição:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

async function handleEditDataCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
  let dataTexto = ctx.message.text.trim();
  let data;
  
  if (dataTexto.toLowerCase() === 'hoje') {
    data = new Date();
    dataTexto = format(data, 'dd/MM/yyyy');
  } else if (dataTexto.toLowerCase() === 'amanhã') {
    data = new Date();
    data.setDate(data.getDate() + 1);
    dataTexto = format(data, 'dd/MM/yyyy');
  } else {
    try {
      data = parse(dataTexto, 'dd/MM/yyyy', new Date());
      if (isNaN(data.getTime())) {
        await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
        return;
      }
    } catch (error) {
      await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY.');
      return;
    }
  }
  
  const dataAtual = new Date(session.data.data_hora);
  const horaAtual = format(dataAtual, 'HH:mm');
  
  try {
    const novaDataHoraTexto = `${dataTexto} ${horaAtual}`;
    const novaDataHora = parse(novaDataHoraTexto, 'dd/MM/yyyy HH:mm', new Date());
    
    if (isNaN(novaDataHora.getTime())) {
      throw new Error('Data ou hora inválida');
    }
    
    await adminSupabase
      .from('sessions')
      .update({
        data: { 
          ...session.data, 
          data_texto: dataTexto,
          data_compromisso: novaDataHora.toISOString(),
          data_hora: novaDataHora.toISOString()
        },
        step: 'confirmar_compromisso',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
      
    await mostrarConfirmacaoCompromisso(ctx, { 
      ...session.data, 
      data_hora: novaDataHora.toISOString() 
    });
  } catch (error) {
    console.error('Erro ao processar data:', error);
    await ctx.reply('Ocorreu um erro ao processar a data. Por favor, tente novamente.');
  }
}

async function handleEditHoraCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const horaTexto = ctx.message.text.trim();
  
  const horaRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
  if (!horaRegex.test(horaTexto)) {
    await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
    return;
  }
  
  try {
    console.log('Dados da sessão:', session.data);
    const dataAtual = new Date(session.data.data_compromisso);
    console.log('Data atual:', dataAtual);

    const [horas, minutos] = horaTexto.split(':').map(Number);
    console.log('Nova hora:', horas, 'Novos minutos:', minutos);

    const novaData = new Date(dataAtual);
    novaData.setHours(horas);
    novaData.setMinutes(minutos);
    console.log('Nova data:', novaData);

    await adminSupabase
      .from('sessions')
      .update({
        data: { 
          ...session.data, 
          data_compromisso: novaData.toISOString(),
          data_hora: novaData.toISOString()
        },
        step: 'confirmar_compromisso',
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);
    
    await mostrarConfirmacaoCompromisso(ctx, { 
      ...session.data, 
      data_hora: novaData.toISOString() 
    });
  } catch (error) {
    console.error('Erro ao processar hora:', error);
    await ctx.reply('Ocorreu um erro ao processar o horário. Por favor, tente novamente.');
  }
}

async function handleEditLocalCompromisso(ctx: BotContext, session: any) {
  if (!ctx.message || !('text' in ctx.message)) return;
  const novoLocal = ctx.message.text.trim();
  const localValue = (novoLocal.toLowerCase() === 'pular') ? null : novoLocal;
  
  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, local: localValue },
      step: 'confirmar_compromisso',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);
    
  await mostrarConfirmacaoCompromisso(ctx, { 
    ...session.data, 
    local: localValue 
  });
}

// ============================================================================
// FUNÇÕES UTILITÁRIAS
// ============================================================================

async function mostrarConfirmacaoCompromisso(ctx: BotContext, data: any) {
  const dataHora = new Date(data.data_hora);
  const dataFormatada = format(dataHora, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const clienteInfo = data.nome_cliente 
    ? `Cliente: ${data.nome_cliente}\n`
    : '';
    
  await ctx.reply(
    `📋 Confirme os dados ATUALIZADOS do compromisso:\n\n` +
    `Título: ${data.titulo}\n` +
    `${clienteInfo}` +
    `Data: ${dataFormatada}\n` +
    (data.local ? `Local: ${data.local}\n` : '') +
    (data.descricao ? `Descrição: ${data.descricao}\n` : '') +
    `\nOs dados estão corretos?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
      [Markup.button.callback('✏️ Editar', 'agenda_editar_dados')],
      [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
    ])
  );
}