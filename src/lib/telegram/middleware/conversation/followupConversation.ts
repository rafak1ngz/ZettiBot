import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parseHoraBrasil, estaNoPassadoBrasil, brasilParaUTC } from '@/utils/timezone';
import { validators } from '@/utils/validators';
import { EstagioFollowup } from '@/types/database';
import { getEstagioTexto } from '../../commands/followup/types';

// ============================================================================
// PROCESSAMENTO DE CONVERSAÇÃO DE FOLLOWUP
// ============================================================================
export async function handleFollowupConversation(ctx: Context, session: any): Promise<boolean> {
  if (!ctx.message || !('text' in ctx.message)) return false;

  const messageText = ctx.message.text.trim();

  try {
    switch (session.step) {
      // Busca de cliente existente
      case 'busca_cliente_followup':
        return await handleBuscaClienteFollowup(ctx, session, messageText);

      // Criação inline de cliente
      case 'criar_cliente_nome_empresa':
        return await handleCriarClienteNomeEmpresa(ctx, session, messageText);

      case 'criar_cliente_contato_nome':
        return await handleCriarClienteContatoNome(ctx, session, messageText);

      case 'criar_cliente_telefone':
        return await handleCriarClienteTelefone(ctx, session, messageText);

      // Dados do followup
      case 'titulo_followup':
        return await handleTituloFollowup(ctx, session, messageText);

      case 'valor_estimado':
        return await handleValorEstimado(ctx, session, messageText);

      case 'data_prevista':
        return await handleDataPrevista(ctx, session, messageText);

      case 'proxima_acao':
        return await handleProximaAcao(ctx, session, messageText);

      // Registrar contato
      case 'registrar_contato':
        return await handleRegistrarContatoTexto(ctx, session, messageText);

      case 'proxima_acao_contato':
        return await handleProximaAcaoContato(ctx, session, messageText);

      default:
        return false;
    }
  } catch (error) {
    console.error('Erro no processamento de followup:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
    return true;
  }
}

// ============================================================================
// BUSCA DE CLIENTE EXISTENTE - VERSÃO CORRIGIDA
// ============================================================================
async function handleBuscaClienteFollowup(ctx: Context, session: any, termoBusca: string): Promise<boolean> {
  if (termoBusca.length < 2) {
    await ctx.reply('Por favor, digite pelo menos 2 caracteres para buscar.');
    return true;
  }

  // Buscar clientes pelo nome
  const { data: clientes, error } = await adminSupabase
    .from('clientes')
    .select('id, nome_empresa, contato_nome, contato_telefone')
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
      `❌ Nenhum cliente encontrado com "${termoBusca}".\n\nDeseja criar um novo cliente?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
        [Markup.button.callback('🔍 Buscar Novamente', 'followup_buscar_cliente')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    );
    return true;
  }

  // Verificar se algum cliente já tem followup ativo
  const clienteIds = clientes.map(c => c.id);
  const { data: followupsAtivos } = await adminSupabase
    .from('followups')
    .select('cliente_id')
    .eq('user_id', session.user_id)
    .eq('status', 'ativo')
    .in('cliente_id', clienteIds);

  const clientesComFollowup = new Set(followupsAtivos?.map(f => f.cliente_id) || []);

  await ctx.reply(`🔍 Resultados da busca por "${termoBusca}":`);

  // Criar botões para os clientes encontrados
  for (const cliente of clientes) {
    const temFollowup = clientesComFollowup.has(cliente.id);
    const contatoInfo = cliente.contato_nome ? ` - ${cliente.contato_nome}` : '';
    const telefoneInfo = cliente.contato_telefone 
      ? `\n📞 ${validators.formatters.telefone(cliente.contato_telefone)}`
      : '';

    const statusEmoji = temFollowup ? '🔄' : '✅';
    const statusTexto = temFollowup ? '(Já tem follow-up ativo)' : '';

    await ctx.reply(
      `${statusEmoji} **${cliente.nome_empresa}**${contatoInfo}${telefoneInfo}\n${statusTexto}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback(
            temFollowup ? '⚠️ Selecionar (substituir follow-up)' : '✅ Selecionar Cliente',
            `followup_selecionar_cliente_${cliente.id}`
          )]
        ])
      }
    );
  }

  // ✅ CORREÇÃO: Parar aqui, sem enviar botões extras nem limpar sessão
  // A sessão deve ser mantida para que o callback followup_selecionar_cliente funcione
  return true;
}

// ============================================================================
// CRIAÇÃO INLINE DE CLIENTE
// ============================================================================
async function handleCriarClienteNomeEmpresa(ctx: Context, session: any, nomeEmpresa: string): Promise<boolean> {
  if (!nomeEmpresa || nomeEmpresa.length < 2) {
    await ctx.reply('Por favor, forneça um nome de empresa válido (mínimo 2 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'criar_cliente_contato_nome',
      data: { ...session.data, nome_empresa: nomeEmpresa },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(`✅ Empresa: **${nomeEmpresa}**\n\nAgora digite o **nome do contato principal**:`);
  return true;
}

async function handleCriarClienteContatoNome(ctx: Context, session: any, contatoNome: string): Promise<boolean> {
  if (!contatoNome || contatoNome.length < 2) {
    await ctx.reply('Por favor, forneça um nome de contato válido (mínimo 2 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'criar_cliente_telefone',
      data: { ...session.data, contato_nome: contatoNome },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(`✅ Contato: **${contatoNome}**\n\nTelefone do contato (opcional, digite "pular"):`);
  return true;
}

async function handleCriarClienteTelefone(ctx: Context, session: any, telefone: string): Promise<boolean> {
  let telefoneValue = null;

  if (telefone.toLowerCase() !== 'pular') {
    const telefoneLimpo = telefone.replace(/[^\d]/g, '');
    
    if (!validators.telefone(telefoneLimpo)) {
      await ctx.reply('Telefone inválido. Por favor, digite um telefone válido ou "pular".');
      return true;
    }
    
    telefoneValue = telefoneLimpo;
  }

  // Criar cliente no banco
  const { data: novoCliente, error: clienteError } = await adminSupabase
    .from('clientes')
    .insert({
      user_id: session.user_id,
      nome_empresa: session.data.nome_empresa,
      contato_nome: session.data.contato_nome,
      contato_telefone: telefoneValue,
      updated_at: new Date().toISOString()
    })
    .select('id, nome_empresa, contato_nome')
    .single();

  if (clienteError || !novoCliente) {
    console.error('Erro ao criar cliente:', clienteError);
    await ctx.reply('Erro ao criar cliente. Por favor, tente novamente.');
    return true;
  }

  // Atualizar sessão com cliente criado e ir para dados do followup
  await adminSupabase
    .from('sessions')
    .update({
      step: 'titulo_followup',
      data: { 
        ...session.data, 
        cliente_id: novoCliente.id,
        nome_cliente: novoCliente.nome_empresa,
        contato_nome: novoCliente.contato_nome
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const telefoneTexto = telefoneValue 
    ? `\n📞 ${validators.formatters.telefone(telefoneValue)}`
    : '';

  await ctx.reply(
    `✅ **Cliente criado com sucesso!**\n\n` +
    `🏢 ${novoCliente.nome_empresa}\n` +
    `👤 ${novoCliente.contato_nome}${telefoneTexto}\n\n` +
    `Agora vamos criar o follow-up!\n\n` +
    `📝 Digite o **título da oportunidade**:\n\n` +
    `Exemplos: "Venda Sistema ERP", "Consultoria em TI"`
  );
  return true;
}

// ============================================================================
// DADOS DO FOLLOWUP
// ============================================================================
async function handleTituloFollowup(ctx: Context, session: any, titulo: string): Promise<boolean> {
  if (!titulo || titulo.length < 3) {
    await ctx.reply('Por favor, forneça um título válido (mínimo 3 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'estagio_botoes',
      data: { ...session.data, titulo },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // Mostrar botões de estágio
  await ctx.reply(
    `✅ Título: **${titulo}**\n\nEm que estágio está esta oportunidade?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔍 Prospecção - Primeiro contato', 'estagio_prospeccao')],
      [Markup.button.callback('📋 Apresentação - Demo/apresentação', 'estagio_apresentacao')],
      [Markup.button.callback('💰 Proposta - Orçamento enviado', 'estagio_proposta')],
      [Markup.button.callback('🤝 Negociação - Ajustes de condições', 'estagio_negociacao')],
      [Markup.button.callback('✅ Fechamento - Pronto para fechar', 'estagio_fechamento')]
    ])
  );
  return true;
}

async function handleValorEstimado(ctx: Context, session: any, valor: string): Promise<boolean> {
  let valorEstimado = null;

  if (valor.toLowerCase() !== 'pular') {
    // Limpar valor (manter apenas números, vírgula e ponto)
    const valorLimpo = valor.replace(/[^\d.,]/g, '');
    const valorNumerico = parseFloat(valorLimpo.replace(',', '.'));
    
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      await ctx.reply('Valor inválido. Digite um valor numérico ou "pular".\n\nExemplo: 15000 ou 15.000,00');
      return true;
    }
    
    valorEstimado = valorNumerico;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'data_prevista',
      data: { ...session.data, valor_estimado: valorEstimado },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const valorTexto = valorEstimado 
    ? `R$ ${new Intl.NumberFormat('pt-BR').format(valorEstimado)}`
    : 'Não informado';

  await ctx.reply(
    `✅ Valor estimado: **${valorTexto}**\n\n` +
    `📅 Data prevista de fechamento (opcional, digite "pular"):\n\n` +
    `Formato: DD/MM/YYYY\nExemplo: 30/08/2025`,
    Markup.keyboard([
      ['Em 1 mês', 'Em 3 meses']
    ]).oneTime().resize()
  );
  return true;
}

async function handleDataPrevista(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  let dataPrevista = null;

  if (dataTexto.toLowerCase() !== 'pular') {
    let data = null;
    
    // Atalhos
    if (dataTexto.toLowerCase() === 'em 1 mês') {
      data = addDays(new Date(), 30);
    } else if (dataTexto.toLowerCase() === 'em 3 meses') {
      data = addDays(new Date(), 90);
    } else {
      // Parse manual da data
      data = parse(dataTexto, 'dd/MM/yyyy', new Date());
    }
    
    if (!isValid(data)) {
      await ctx.reply('Data inválida. Use o formato DD/MM/YYYY ou digite "pular".\n\nExemplo: 30/08/2025');
      return true;
    }
    
    // Verificar se não é no passado
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (data < hoje) {
      await ctx.reply('A data prevista não pode ser no passado. Digite uma data futura.');
      return true;
    }
    
    dataPrevista = brasilParaUTC(data).toISOString();
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'proxima_acao',
      data: { ...session.data, data_prevista: dataPrevista },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const dataTextoFormatado = dataPrevista 
    ? format(new Date(dataPrevista), 'dd/MM/yyyy', { locale: ptBR })
    : 'Não informada';

  await ctx.reply(
    `✅ Previsão: **${dataTextoFormatado}**\n\n` +
    `🎬 Qual é a **próxima ação** para este follow-up?\n\n` +
    `Exemplos:\n` +
    `• "Ligar segunda-feira para agendar demo"\n` +
    `• "Aguardar retorno da proposta"\n` +
    `• "Enviar material técnico por email"`,
    Markup.removeKeyboard()
  );
  return true;
}

async function handleProximaAcao(ctx: Context, session: any, proximaAcao: string): Promise<boolean> {
  if (!proximaAcao || proximaAcao.length < 5) {
    await ctx.reply('Por favor, descreva a próxima ação com mais detalhes (mínimo 5 caracteres).');
    return true;
  }

  // Atualizar sessão para confirmação
  await adminSupabase
    .from('sessions')
    .update({
      step: 'confirmar_followup',
      data: { ...session.data, proxima_acao: proximaAcao },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // Mostrar resumo para confirmação
  const dadosFollowup = { ...session.data, proxima_acao: proximaAcao };
  
  const valorTexto = dadosFollowup.valor_estimado 
    ? `💰 R$ ${new Intl.NumberFormat('pt-BR').format(dadosFollowup.valor_estimado)}`
    : '💰 Valor não informado';

  const previsaoTexto = dadosFollowup.data_prevista 
    ? `📅 ${format(new Date(dadosFollowup.data_prevista), 'dd/MM/yyyy', { locale: ptBR })}`
    : '📅 Sem previsão';

  const estagioTexto = getEstagioTexto(dadosFollowup.estagio);

  await ctx.reply(
    `📋 **Resumo do Follow-up**\n\n` +
    `🏢 **Cliente:** ${dadosFollowup.nome_cliente}\n` +
    `👤 **Contato:** ${dadosFollowup.contato_nome || 'Não informado'}\n` +
    `📝 **Título:** ${dadosFollowup.titulo}\n` +
    `🎯 **Estágio:** ${estagioTexto}\n` +
    `${valorTexto}\n` +
    `${previsaoTexto}\n` +
    `🎬 **Próxima ação:** ${proximaAcao}\n\n` +
    `Os dados estão corretos?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Confirmar e Criar', 'followup_confirmar')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    }
  );
  return true;
}

// ============================================================================
// REGISTRAR CONTATO
// ============================================================================
async function handleRegistrarContatoTexto(ctx: Context, session: any, resumoContato: string): Promise<boolean> {
  if (!resumoContato || resumoContato.length < 5) {
    await ctx.reply('Por favor, forneça um resumo mais detalhado do contato (mínimo 5 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'proxima_acao_contato',
      data: { ...session.data, resumo_contato: resumoContato },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    `✅ **Contato registrado:**\n${resumoContato}\n\n` +
    `🎬 **Qual a próxima ação?**\n\n` +
    `Exemplo: "Fazer demo quinta-feira às 14h"`
  );
  return true;
}

async function handleProximaAcaoContato(ctx: Context, session: any, proximaAcao: string): Promise<boolean> {
  if (!proximaAcao || proximaAcao.length < 5) {
    await ctx.reply('Por favor, descreva a próxima ação com mais detalhes.');
    return true;
  }

  try {
    // Atualizar followup no banco
    const { error } = await adminSupabase
      .from('followups')
      .update({
        ultimo_contato: new Date().toISOString(),
        proxima_acao: proximaAcao,
        updated_at: new Date().toISOString()
      })
      .eq('id', session.data.id)
      .eq('user_id', session.user_id);

    if (error) {
      console.error('Erro ao atualizar followup:', error);
      await ctx.reply('Erro ao registrar contato. Por favor, tente novamente.');
      return true;
    }

    // Limpar sessão
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('id', session.id);

    // Perguntar sobre atualização de estágio
    await ctx.reply(
      `✅ **Contato registrado com sucesso!**\n\n` +
      `📞 ${session.data.resumo_contato}\n` +
      `🎬 ${proximaAcao}\n\n` +
      `🎯 Deseja atualizar o estágio do follow-up?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Prospecção', `atualizar_estagio_${session.data.id}_prospeccao`)],
        [Markup.button.callback('📋 Apresentação', `atualizar_estagio_${session.data.id}_apresentacao`)],
        [Markup.button.callback('💰 Proposta', `atualizar_estagio_${session.data.id}_proposta`)],
        [Markup.button.callback('🤝 Negociação', `atualizar_estagio_${session.data.id}_negociacao`)],
        [Markup.button.callback('✅ Fechamento', `atualizar_estagio_${session.data.id}_fechamento`)],
        [Markup.button.callback('➡️ Manter atual', 'manter_estagio_atual')]
      ])
    );

    return true;
  } catch (error) {
    console.error('Erro ao processar contato:', error);
    await ctx.reply('Ocorreu um erro ao processar o contato.');
    return true;
  }
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