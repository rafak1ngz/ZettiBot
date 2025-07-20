import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseHoraBrasil, estaNoPassadoBrasil, brasilParaUTC } from '@/utils/timezone';

// ============================================================================
// PROCESSAMENTO DE CONVERSAÇÃO DE LEMBRETES
// ============================================================================
export async function handleLembretesConversation(ctx: Context, session: any): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;

  const messageText = ctx.message.text.trim();

  try {
    switch (session.step) {
      case 'titulo_lembrete':
        return await handleTituloLembrete(ctx, session, messageText);

      case 'data_lembrete':
        return await handleDataLembrete(ctx, session, messageText);

      case 'hora_lembrete':
        return await handleHoraLembrete(ctx, session, messageText);

      case 'descricao_lembrete':
        return await handleDescricaoLembrete(ctx, session, messageText);

      // Steps de edição
      case 'edit_titulo_lembrete':
        return await handleEditTitulo(ctx, session, messageText);

      case 'edit_data_lembrete':
        return await handleEditData(ctx, session, messageText);

      case 'edit_hora_lembrete':
        return await handleEditHora(ctx, session, messageText);

      case 'edit_descricao_lembrete':
        return await handleEditDescricao(ctx, session, messageText);

      default:
        return false;
    }
  } catch (error) {
    console.error('Erro no processamento de lembretes:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    return true;
  }
}

// ============================================================================
// CRIAR NOVO LEMBRETE - STEPS
// ============================================================================

async function handleTituloLembrete(ctx: Context, session: any, titulo: string): Promise<boolean> {
  if (!titulo || titulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido para o lembrete (mínimo 3 caracteres).');
    return true;
  }

  // Atualizar sessão para próximo step
  await adminSupabase
    .from('sessions')
    .update({
      step: 'data_lembrete',
      data: { ...session.data, titulo },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // ✅ PRIMEIRA mensagem sem botões
  await ctx.reply('Digite a data do lembrete no formato DD/MM/YYYY:');
  
  // ✅ SEGUNDA mensagem COM botões
  await ctx.reply(
    'Escolha uma opção ou digite a data:',
    Markup.keyboard([
      ['Hoje', 'Amanhã']
    ]).oneTime().resize()
  );
  return true;
}

async function handleDataLembrete(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  const data = parseDataTexto(dataTexto);
  
  if (!data) {
    await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY ou digite "hoje" ou "amanhã".');
    return true;
  }

  // Verificar se a data não é no passado
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  
  if (data < hoje) {
    await ctx.reply('Não é possível criar lembretes para datas passadas. Por favor, digite uma data futura.');
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      step: 'hora_lembrete',
      data: { ...session.data, data_texto: dataTexto, data_selecionada: data.toISOString() },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    'Digite o horário do lembrete no formato HH:MM:\n\nExemplo: 14:30',
    Markup.removeKeyboard()
  );
  return true;
}

async function handleHoraLembrete(ctx: Context, session: any, horaTexto: string): Promise<boolean> {
  const dataBase = new Date(session.data.data_selecionada);
  const dataUTC = parseHoraBrasil(dataBase, horaTexto);
  
  if (!dataUTC) {
    await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
    return true;
  }

  if (estaNoPassadoBrasil(dataUTC)) {
    await ctx.reply('Este horário já passou. Por favor, digite um horário futuro.');
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      step: 'descricao_lembrete', // ✅ NOVO: Ir para descrição primeiro
      data: { 
        ...session.data, 
        hora_texto: horaTexto,
        data_lembrete: dataUTC.toISOString()
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // ✅ NOVO: Pedir descrição antes da prioridade
  await ctx.reply('Digite uma descrição para o lembrete (opcional, digite "pular" para continuar):');
  return true;
}

async function handleDescricaoLembrete(ctx: Context, session: any, descricao: string): Promise<boolean> {
  const descricaoValue = (descricao.toLowerCase() === 'pular') ? null : descricao;

  await adminSupabase
    .from('sessions')
    .update({
      step: 'prioridade_botoes', // ✅ AGORA vai para prioridade
      data: { ...session.data, descricao: descricaoValue },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // ✅ AGORA mostrar botões de prioridade
  await ctx.reply(
    'Qual a prioridade deste lembrete?',
    Markup.inlineKeyboard([
      [Markup.button.callback('🔴 Alta - Urgente', 'prioridade_alta')],
      [Markup.button.callback('🟡 Média - Importante', 'prioridade_media')],
      [Markup.button.callback('🔵 Baixa - Quando possível', 'prioridade_baixa')]
    ])
  );
  return true;
}

// ============================================================================
// EDIÇÃO DE LEMBRETE EXISTENTE
// ============================================================================

async function handleEditTitulo(ctx: Context, session: any, novoTitulo: string): Promise<boolean> {
  if (!novoTitulo || novoTitulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido para o lembrete (mínimo 3 caracteres).');
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

async function handleEditData(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  const data = parseDataTexto(dataTexto);
  
  if (!data) {
    await ctx.reply('Data inválida. Por favor, use o formato DD/MM/YYYY ou digite "hoje" ou "amanhã".');
    return true;
  }

  // Manter hora atual mas atualizar data
  const dataAtualUTC = new Date(session.data.data_lembrete);
  const dataAtualBrasil = new Date(dataAtualUTC.getTime() - (3 * 60 * 60 * 1000));
  
  // Criar nova data brasileira com nova data mas mesma hora
  const novaDataBrasil = new Date(
    data.getFullYear(),
    data.getMonth(),
    data.getDate(),
    dataAtualBrasil.getHours(),
    dataAtualBrasil.getMinutes(),
    0,
    0
  );
  
  // Converter para UTC
  const novaDataUTC = brasilParaUTC(novaDataBrasil);

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, data_lembrete: novaDataUTC.toISOString() },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, data_lembrete: novaDataUTC.toISOString() });
  return true;
}

async function handleEditHora(ctx: Context, session: any, horaTexto: string): Promise<boolean> {
  const horaData = parseHoraTexto(horaTexto);
  
  if (!horaData) {
    await ctx.reply('Horário inválido. Por favor, use o formato HH:MM (exemplo: 14:30).');
    return true;
  }

  // Atualizar hora mantendo a data
  const dataAtualUTC = new Date(session.data.data_lembrete);
  const dataAtualBrasil = new Date(dataAtualUTC.getTime() - (3 * 60 * 60 * 1000));
  
  const novaDataBrasil = new Date(
    dataAtualBrasil.getFullYear(),
    dataAtualBrasil.getMonth(),
    dataAtualBrasil.getDate(),
    horaData.horas,
    horaData.minutos,
    0,
    0
  );
  
  const novaDataUTC = brasilParaUTC(novaDataBrasil);

  await adminSupabase
    .from('sessions')
    .update({
      data: { ...session.data, data_lembrete: novaDataUTC.toISOString() },
      step: 'confirmar_edicao',
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await mostrarConfirmacaoEdicao(ctx, { ...session.data, data_lembrete: novaDataUTC.toISOString() });
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
  try {
    const dataLembreteUTC = new Date(dados.data_lembrete);
    const dataLembreteBrasil = new Date(dataLembreteUTC.getTime() - (3 * 60 * 60 * 1000));
    const dataFormatada = format(dataLembreteBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    // 🔥 CORREÇÃO: Cast de tipo para prioridade
    const prioridade = dados.prioridade as 'alta' | 'media' | 'baixa';
    const textoPrioridade = {
      alta: '🔴 Alta - Urgente',
      media: '🟡 Média - Importante',
      baixa: '🔵 Baixa - Quando possível'
    }[prioridade] || '⚪ Normal';

    await ctx.reply(
      `📋 Confirme as alterações do lembrete:\n\n` +
      `📝 Título: ${dados.titulo}\n` +
      `🎯 Prioridade: ${textoPrioridade}\n` +
      `📅 Data: ${dataFormatada}\n` +
      (dados.descricao ? `💬 Descrição: ${dados.descricao}\n` : '') +
      `\nDeseja salvar as alterações?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('✅ Salvar Alterações', 'lembrete_salvar_edicao'),
          Markup.button.callback('✏️ Continuar Editando', 'lembrete_continuar_editando')
        ],
        [
          Markup.button.callback('❌ Cancelar', 'cancelar_acao')
        ]
      ])
    );
  } catch (error) {
    console.error('Erro ao mostrar confirmação:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}