// ============================================================================
// PROCESSAMENTO DE CONVERSAÇÃO DE FOLLOWUP - VERSÃO CORRIGIDA
// ============================================================================

import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { estaNoPassadoBrasil, brasilParaUTC, parseDataBrasil } from '@/utils/timezone';
import { validators } from '@/utils/validators';
// ✅ CORRIGIDO: Import unificado
import { EstagioFollowup, getEstagioTexto, ESTAGIO_TEXTO } from '../../commands/followup/types';

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
// BUSCA DE CLIENTE EXISTENTE
// ============================================================================
async function handleBuscaClienteFollowup(ctx: Context, session: any, termoBusca: string): Promise<boolean> {
  if (termoBusca.length < 2) {
    await ctx.reply('Por favor, digite pelo menos 2 caracteres para buscar.');
    return true;
  }

  try {
    // Buscar clientes
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('id, nome_empresa, contato_nome, cnpj')
      .eq('user_id', session.user_id)
      .or(`nome_empresa.ilike.%${termoBusca}%,cnpj.ilike.%${termoBusca}%,contato_nome.ilike.%${termoBusca}%`);

    if (error) {
      console.error('Erro ao buscar clientes:', error);
      await ctx.reply('Erro ao buscar clientes. Tente novamente.');
      return true;
    }

    if (!clientes || clientes.length === 0) {
      await ctx.reply(
        `❌ Nenhum cliente encontrado para "${termoBusca}".\n\n` +
        `Deseja criar um novo cliente?`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
          [Markup.button.callback('🔍 Buscar Novamente', 'followup_buscar_cliente')],
          [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
        ])
      );
      return true;
    }

    // Mostrar resultados
    await ctx.reply(`🔍 **Clientes encontrados:**\n\nSelecione o cliente desejado:`, { parse_mode: 'Markdown' });

    for (const cliente of clientes.slice(0, 10)) { // Limitar a 10 resultados
      const cnpjTexto = cliente.cnpj ? `\n📋 ${validators.formatters.cnpj(cliente.cnpj)}` : '';
      const contatoTexto = cliente.contato_nome ? `\n👤 ${cliente.contato_nome}` : '';

      await ctx.reply(
        `🏢 **${cliente.nome_empresa}**${cnpjTexto}${contatoTexto}`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Selecionar', `followup_selecionar_${cliente.id}`)]
          ])
        }
      );
    }

    return true;
  } catch (error) {
    console.error('Erro na busca de cliente:', error);
    await ctx.reply('Erro ao buscar clientes. Tente novamente.');
    return true;
  }
}

// ============================================================================
// CRIAÇÃO INLINE DE CLIENTE
// ============================================================================
async function handleCriarClienteNomeEmpresa(ctx: Context, session: any, nomeEmpresa: string): Promise<boolean> {
  if (!nomeEmpresa || nomeEmpresa.length < 2) {
    await ctx.reply('Por favor, forneça um nome válido para a empresa (mínimo 2 caracteres).');
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

  await ctx.reply(
    `✅ **Empresa:** ${nomeEmpresa}\n\n` +
    `👤 Digite o **nome do contato principal**:`,
    { parse_mode: 'Markdown' }
  );
  return true;
}

async function handleCriarClienteContatoNome(ctx: Context, session: any, contatoNome: string): Promise<boolean> {
  if (!contatoNome || contatoNome.length < 2) {
    await ctx.reply('Por favor, forneça um nome válido para o contato (mínimo 2 caracteres).');
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

  await ctx.reply(
    `✅ **Contato:** ${contatoNome}\n\n` +
    `📞 Digite o **telefone** ou "pular":`,
    { parse_mode: 'Markdown' }
  );
  return true;
}

async function handleCriarClienteTelefone(ctx: Context, session: any, telefone: string): Promise<boolean> {
  let telefoneValue = null;

  if (telefone.toLowerCase() !== 'pular') {
    // ✅ CORRIGIDO: Usar validators.cleanTelefone()
    const telefoneLimpo = validators.cleanTelefone(telefone);
    
    if (!validators.telefone(telefoneLimpo)) {
      await ctx.reply('Por favor, digite um telefone válido ou "pular".');
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
    `Exemplos: "Venda Sistema ERP", "Consultoria em TI"`,
    { parse_mode: 'Markdown' }
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
      step: 'escolher_estagio',
      data: { ...session.data, titulo },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  // Mostrar opções de estágio
  await ctx.reply(
    `✅ **Título:** ${titulo}\n\n` +
    `🎯 Escolha o **estágio atual** da oportunidade:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Prospecção', 'followup_estagio_prospeccao')],
        [Markup.button.callback('📋 Apresentação', 'followup_estagio_apresentacao')],
        [Markup.button.callback('💰 Proposta', 'followup_estagio_proposta')],
        [Markup.button.callback('🤝 Negociação', 'followup_estagio_negociacao')],
        [Markup.button.callback('✅ Fechamento', 'followup_estagio_fechamento')]
      ])
    }
  );
  return true;
}

async function handleValorEstimado(ctx: Context, session: any, valorTexto: string): Promise<boolean> {
  let valorValue = null;

  if (valorTexto.toLowerCase() !== 'pular') {
    const valorLimpo = valorTexto.replace(/[^\d,.-]/g, '').replace(',', '.');
    const valorNumerico = parseFloat(valorLimpo);

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      await ctx.reply('Por favor, digite um valor válido ou "pular".\n\nExemplo: 15000 ou R$ 15.000');
      return true;
    }

    valorValue = valorNumerico;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'data_prevista',
      data: { ...session.data, valor_estimado: valorValue },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const valorTextoFormatado = valorValue 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorValue)
    : 'Não informado';

  await ctx.reply(
    `✅ **Valor:** ${valorTextoFormatado}\n\n` +
    `📅 Digite a **data prevista** de fechamento ou escolha uma opção:`,
    { parse_mode: 'Markdown' }
  );

  // ✅ CORRIGIDO: Botões inline em vez de keyboard
  await ctx.reply(
    `Ou escolha uma opção rápida:`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📅 Hoje', 'data_hoje_followup'),
          Markup.button.callback('🗓️ Amanhã', 'data_amanha_followup')
        ],
        [Markup.button.callback('📆 Próxima semana', 'data_semana_followup')],
        [Markup.button.callback('⏭️ Pular', 'data_pular_followup')]
      ])
    }
  );
  return true;
}

async function handleDataPrevista(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  let dataValue = null;

  if (dataTexto.toLowerCase() !== 'pular') {
    // ✅ CORRIGIDO: Usar parseDataBrasil do timezone
    const dataParseada = parseDataBrasil(dataTexto);
    
    if (!dataParseada || estaNoPassadoBrasil(brasilParaUTC(dataParseada))) {
      await ctx.reply(
        'Por favor, forneça uma data futura válida ou "pular".\n\n' +
        'Formatos aceitos: 15/12/2024, 15/12, amanhã, próxima semana'
      );
      return true;
    }

    dataValue = brasilParaUTC(dataParseada).toISOString();
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'proxima_acao',
      data: { ...session.data, data_prevista: dataValue },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const dataFormatada = dataValue 
    ? format(new Date(dataValue), 'dd/MM/yyyy', { locale: ptBR })
    : 'Não definida';

  await ctx.reply(
    `✅ **Data prevista:** ${dataFormatada}\n\n` +
    `🎬 Digite a **próxima ação** a ser realizada:\n\n` +
    `Exemplos: "Agendar reunião", "Enviar proposta", "Fazer follow-up"`,
    { parse_mode: 'Markdown' }
  );
  return true;
}

async function handleProximaAcao(ctx: Context, session: any, proximaAcao: string): Promise<boolean> {
  if (!proximaAcao || proximaAcao.length < 3) {
    await ctx.reply('Por favor, descreva a próxima ação (mínimo 3 caracteres).');
    return true;
  }

  try {
    // Criar followup no banco
    const agora = new Date().toISOString();
    
    const { data: followup, error: followupError } = await adminSupabase
      .from('followups')
      .insert({
        user_id: session.user_id,
        cliente_id: session.data.cliente_id,
        titulo: session.data.titulo,
        estagio: session.data.estagio,
        valor_estimado: session.data.valor_estimado,
        data_inicio: agora,
        data_prevista: session.data.data_prevista,
        ultimo_contato: agora,
        proxima_acao: proximaAcao,
        status: 'ativo',
        created_at: agora,
        updated_at: agora
      })
      .select('id')
      .single();

    if (followupError || !followup) {
      console.error('Erro ao criar followup:', followupError);
      await ctx.reply('Erro ao criar follow-up. Tente novamente.');
      return true;
    }

    // Limpar sessão
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('id', session.id);

    // Mostrar resumo final
    const valorFormatado = session.data.valor_estimado 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(session.data.valor_estimado)
      : 'Não informado';
      
    const dataFormatada = session.data.data_prevista 
      ? format(new Date(session.data.data_prevista), 'dd/MM/yyyy', { locale: ptBR })
      : 'Não definida';

    await ctx.reply(
      `🎉 **Follow-up criado com sucesso!**\n\n` +
      `📋 **${session.data.titulo}**\n` +
      `🏢 **Cliente:** ${session.data.nome_cliente}\n` +
      `${getEstagioTexto(session.data.estagio)}\n` +
      `💰 **Valor:** ${valorFormatado}\n` +
      `📅 **Previsão:** ${dataFormatada}\n` +
      `🎬 **Próxima ação:** ${proximaAcao}\n\n` +
      `Deseja configurar lembretes?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔕 Sem notificação', `notif_followup_nao_${followup.id}`)],
          [Markup.button.callback('⏰ 1 hora antes', `notif_followup_1h_${followup.id}`)],
          [Markup.button.callback('📅 24h antes', `notif_followup_24h_${followup.id}`)],
          [Markup.button.callback('📆 3 dias antes', `notif_followup_3d_${followup.id}`)]
        ])
      }
    );

    return true;
  } catch (error) {
    console.error('Erro ao finalizar followup:', error);
    await ctx.reply('Erro ao criar follow-up. Tente novamente.');
    return true;
  }
}

// ============================================================================
// REGISTRAR CONTATO
// ============================================================================
async function handleRegistrarContatoTexto(ctx: Context, session: any, contatoTexto: string): Promise<boolean> {
  if (!contatoTexto || contatoTexto.length < 5) {
    await ctx.reply('Por favor, descreva o contato com mais detalhes (mínimo 5 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'proxima_acao_contato',
      data: { ...session.data, contato_descricao: contatoTexto },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    `✅ **Contato registrado**\n\n` +
    `📝 Digite a **próxima ação** a ser realizada:`,
    { parse_mode: 'Markdown' }
  );
  return true;
}

async function handleProximaAcaoContato(ctx: Context, session: any, proximaAcao: string): Promise<boolean> {
  if (!proximaAcao || proximaAcao.length < 3) {
    await ctx.reply('Por favor, descreva a próxima ação (mínimo 3 caracteres).');
    return true;
  }

  try {
    const agora = new Date().toISOString();

    // Atualizar followup
    const { error: updateError } = await adminSupabase
      .from('followups')
      .update({
        ultimo_contato: agora,
        proxima_acao: proximaAcao,
        updated_at: agora
      })
      .eq('id', session.data.followup_id);

    if (updateError) {
      console.error('Erro ao atualizar followup:', updateError);
      await ctx.reply('Erro ao registrar contato. Tente novamente.');
      return true;
    }

    // Limpar sessão
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('id', session.id);

    // ✅ NOVO: Buscar dados atualizados do follow-up para mostrar
    const { data: followupAtualizado, error: fetchError } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', session.data.followup_id)
      .single();

    if (fetchError || !followupAtualizado) {
      console.error('Erro ao buscar follow-up atualizado:', fetchError);
    }

    const cliente = Array.isArray(followupAtualizado?.clientes) 
      ? followupAtualizado.clientes[0] 
      : followupAtualizado?.clientes;

    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';

    await ctx.reply(
      `✅ **Contato registrado com sucesso!**\n\n` +
      `🏢 **Cliente:** ${nomeEmpresa}\n` +
      `📝 **Resumo do contato:** ${session.data.resumo_contato}\n` +
      `🎬 **Próxima ação:** ${proximaAcao}\n` +
      `🕐 **Último contato:** Hoje, ${format(new Date(), 'HH:mm', { locale: ptBR })}\n\n` +
      `🎯 **Dica:** Você pode ver todos os dados atualizados em "📋 Listar Follow-ups"`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔄 Ver Follow-ups Ativos', 'followup_listar_ativos'),
            Markup.button.callback('🆕 Novo Follow-up', 'followup_novo')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      }
    );

    return true;
  } catch (error) {
    console.error('Erro ao finalizar registro de contato:', error);
    await ctx.reply('Erro ao registrar contato. Tente novamente.');
    return true;
  }
}