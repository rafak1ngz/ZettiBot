import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays, subHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ============================================================================
// PROCESSAMENTO DE CONVERSAÇÃO DE AGENDA
// ============================================================================
export async function handleAgendaConversation(ctx: Context, session: any): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;

  const messageText = ctx.message.text.trim();

  try {
    switch (session.step) {
      case 'titulo_compromisso':
        return await handleTituloCompromisso(ctx, session, messageText);

      case 'descricao_compromisso':
        return await handleDescricaoCompromisso(ctx, session, messageText);

      case 'data_compromisso':
        return await handleDataCompromisso(ctx, session, messageText);

      case 'hora_compromisso':
        return await handleHoraCompromisso(ctx, session, messageText);

      case 'local_compromisso':
        return await handleLocalCompromisso(ctx, session, messageText);

      case 'busca_cliente':
        return await handleBuscaCliente(ctx, session, messageText);

      // Steps de edição
      case 'edit_titulo_compromisso':
        return await handleEditTitulo(ctx, session, messageText);

      case 'edit_descricao_compromisso':
        return await handleEditDescricao(ctx, session, messageText);

      case 'edit_data_compromisso':
        return await handleEditData(ctx, session, messageText);

      case 'edit_hora_compromisso':
        return await handleEditHora(ctx, session, messageText);

      case 'edit_local_compromisso':
        return await handleEditLocal(ctx, session, messageText);

      default:
        return false;
    }
  } catch (error) {
    console.error('Erro no processamento de agenda:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    return true;
  }
}

// ============================================================================
// CRIAR NOVO COMPROMISSO - STEPS
// ============================================================================

async function handleTituloCompromisso(ctx: Context, session: any, titulo: string): Promise<boolean> {
  if (!titulo || titulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido para o compromisso (mínimo 3 caracteres).');
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      step: 'descricao_compromisso',
      data: { ...session.data, titulo },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply('Digite uma descrição para o compromisso (opcional, digite "pular" para continuar):');
  return true;
}

async function handleDescricaoCompromisso(ctx: Context, session: any, descricao: string): Promise<boolean> {
  const descricaoValue = (descricao.toLowerCase() === 'pular') ? null : descricao;

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
  return true;
}

async function handleDataCompromisso(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  const data = parseDataTexto(dataTexto);
  
  if (!data) {
    await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY ou digite "hoje" ou "amanhã".');
    return true;
  }

  // Verificar se a data não é no passado (considerando fuso brasileiro)
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  
  if (data < hoje) {
    await ctx.reply('Não é possível agendar compromissos para datas passadas. Por favor, digite uma data futura.');
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      step: 'hora_compromisso',
      data: { ...session.data, data_texto: dataTexto, data_selecionada: data.toISOString() },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    'Digite o horário do compromisso no formato HH:MM:',
    Markup.removeKeyboard()
  );
  return true;
}

async function handleHoraCompromisso(ctx: Context, session: any, horaTexto: string): Promise<boolean> {
  const horaData = parseHoraTexto(horaTexto);
  
  if (!horaData) {
    await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
    return true;
  }

  // Combinar data e hora
  const dataBase = new Date(session.data.data_selecionada);
  const dataCompleta = new Date(dataBase);
  dataCompleta.setHours(horaData.horas, horaData.minutos, 0, 0);

  // Validação simplificada: aceitar qualquer horário válido
  // (a validação de "passado" será feita apenas na data, não no horário)

  await adminSupabase
    .from('sessions')
    .update({
      step: 'local_compromisso',
      data: { 
        ...session.data, 
        hora_texto: horaTexto,
        data_compromisso: dataCompleta.toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply('Digite o local do compromisso (opcional, digite "pular" para continuar):');
  return true;
}

async function handleLocalCompromisso(ctx: Context, session: any, local: string): Promise<boolean> {
  const localValue = (local.toLowerCase() === 'pular') ? null : local;

  await adminSupabase
    .from('sessions')
    .update({
      step: 'confirmar_compromisso',
      data: { ...session.data, local: localValue },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // Mostrar resumo para confirmação (usando horário brasileiro para exibição)
  const dataHora = new Date(session.data.data_compromisso);
  const dataHoraBrasil = subHours(dataHora, 3); // Converter para horário brasileiro para exibição
  const dataFormatada = format(dataHoraBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const clienteInfo = session.data.nome_cliente 
    ? `👥 Cliente: ${session.data.nome_cliente}\n`
    : '';

  await ctx.reply(
    `📋 Confirme os dados do compromisso:\n\n` +
    `📝 Título: ${session.data.titulo}\n` +
    `${clienteInfo}` +
    `📅 Data: ${dataFormatada}\n` +
    (localValue ? `📍 Local: ${localValue}\n` : '') +
    (session.data.descricao ? `📄 Descrição: ${session.data.descricao}\n` : '') +
    `\nOs dados estão corretos?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Confirmar', 'agenda_confirmar')],
      [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
    ])
  );
  return true;
}

// ============================================================================
// BUSCA DE CLIENTE
// ============================================================================

async function handleBuscaCliente(ctx: Context, session: any, termoBusca: string): Promise<boolean> {
  if (termoBusca.length < 2) {
    await ctx.reply('Por favor, digite pelo menos 2 caracteres para buscar.');
    return true;
  }

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
    return true;
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
    return true;
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

  return true;
}

// ============================================================================
// EDIÇÃO DE COMPROMISSO EXISTENTE
// ============================================================================

async function handleEditTitulo(ctx: Context, session: any, novoTitulo: string): Promise<boolean> {
  if (!novoTitulo || novoTitulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido para o compromisso (mínimo 3 caracteres).');
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, titulo: novoTitulo },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, titulo: novoTitulo });
  return true;
}

async function handleEditDescricao(ctx: Context, session: any, novaDescricao: string): Promise<boolean> {
  const descricaoValue = (novaDescricao.toLowerCase() === 'pular') ? null : novaDescricao;

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, descricao: descricaoValue },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, descricao: descricaoValue });
  return true;
}

async function handleEditData(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  const data = parseDataTexto(dataTexto);
  
  if (!data) {
    await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY ou digite "hoje" ou "amanhã".');
    return true;
  }

  // Manter a hora atual
  const dataAtual = new Date(session.data.data_compromisso);
  const novaData = new Date(data);
  novaData.setHours(dataAtual.getHours(), dataAtual.getMinutes(), 0, 0);

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, data_compromisso: novaData.toISOString() },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, data_compromisso: novaData.toISOString() });
  return true;
}

async function handleEditHora(ctx: Context, session: any, horaTexto: string): Promise<boolean> {
  const horaData = parseHoraTexto(horaTexto);
  
  if (!horaData) {
    await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
    return true;
  }

  const dataAtual = new Date(session.data.data_compromisso);
  const novaData = new Date(dataAtual);
  novaData.setHours(horaData.horas, horaData.minutos, 0, 0);

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, data_compromisso: novaData.toISOString() },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, data_compromisso: novaData.toISOString() });
  return true;
}

async function handleEditLocal(ctx: Context, session: any, novoLocal: string): Promise<boolean> {
  const localValue = (novoLocal.toLowerCase() === 'pular') ? null : novoLocal;

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, local: localValue },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, local: localValue });
  return true;
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function parseDataTexto(dataTexto: string): Date | null {
  try {
    if (dataTexto.toLowerCase() === 'hoje') {
      return new Date();
    } else if (dataTexto.toLowerCase() === 'amanhã') {
      return addDays(new Date(), 1);
    }
    
    const data = parse(dataTexto, 'dd/MM/yyyy', new Date());
    return isValid(data) ? data : null;
  } catch {
    return null;
  }
}

function parseHoraTexto(horaTexto: string): { horas: number; minutos: number } | null {
  try {
    const horaRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    const match = horaTexto.match(horaRegex);
    
    if (match) {
      return {
        horas: parseInt(match[1]),
        minutos: parseInt(match[2])
      };
    }
    
    return null;
  } catch {
    return null;
  }
}

async function mostrarConfirmacaoEdicao(ctx: Context, dados: any): Promise<void> {
  const dataHora = new Date(dados.data_compromisso);
  const dataHoraBrasil = subHours(dataHora, 3); // Converter para horário brasileiro
  const dataFormatada = format(dataHoraBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const clienteInfo = dados.nome_cliente 
    ? `👥 Cliente: ${dados.nome_cliente}\n`
    : '';

  await ctx.reply(
    `📋 Confirme as alterações do compromisso:\n\n` +
    `📝 Título: ${dados.titulo}\n` +
    `${clienteInfo}` +
    `📅 Data: ${dataFormatada}\n` +
    (dados.local ? `📍 Local: ${dados.local}\n` : '') +
    (dados.descricao ? `📄 Descrição: ${dados.descricao}\n` : '') +
    `\nOs dados estão corretos?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('✅ Salvar Alterações', 'agenda_atualizar')],
      [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
    ])
  );
}