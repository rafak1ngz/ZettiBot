// ============================================================================
// PROCESSAMENTO DE CONVERSAÇÃO DE FOLLOWUP - COM TECLADO IGUAL LEMBRETES
// ============================================================================

import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format, parse, isValid, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { estaNoPassadoBrasil, brasilParaUTC, parseDataBrasil, parseHoraBrasil } from '@/utils/timezone';
import { validators } from '@/utils/validators';
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

      // ✅ Data específica da próxima ação (quando usuário digita)
      case 'data_proxima_acao_contato':
        return await handleDataProximaAcaoContato(ctx, session, messageText);

      // ✅ Horário da próxima ação (sempre digitado)
      case 'horario_proxima_acao':
        return await handleHorarioProximaAcao(ctx, session, messageText);

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
    const { data: clientes, error } = await adminSupabase
      .from('clientes')
      .select('id, nome_empresa, contato_nome, contato_telefone')
      .eq('user_id', session.user_id)
      .ilike('nome_empresa', `%${termoBusca}%`)
      .limit(10);

    if (error) {
      console.error('Erro ao buscar clientes:', error);
      await ctx.reply('Erro ao buscar clientes. Tente novamente.');
      return true;
    }

    if (!clientes || clientes.length === 0) {
      await ctx.reply(
        `❌ **Nenhuma empresa encontrada** com "${termoBusca}"\n\n` +
        `Deseja criar um novo cliente?`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
            [Markup.button.callback('🔍 Buscar Novamente', 'followup_buscar_cliente')]
          ])
        }
      );
      return true;
    }

    // Mostrar resultados
    const botoes = clientes.map(cliente => {
      const contatoInfo = cliente.contato_nome ? ` - ${cliente.contato_nome}` : '';
      const telefoneInfo = cliente.contato_telefone ? ` (${cliente.contato_telefone})` : '';
      return [Markup.button.callback(
        `${cliente.nome_empresa}${contatoInfo}${telefoneInfo}`,
        `followup_selecionar_cliente_${cliente.id}`
      )];
    });

    botoes.push([Markup.button.callback('🔍 Nova Busca', 'followup_buscar_cliente')]);
    botoes.push([Markup.button.callback('🆕 Criar Novo', 'followup_criar_cliente')]);

    await ctx.reply(
      `🔍 **Resultados da busca:**\n\n` +
      `Encontrei ${clientes.length} empresa(s). Selecione uma:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(botoes)
      }
    );

    return true;
  } catch (error) {
    console.error('Erro na busca:', error);
    await ctx.reply('Erro na busca. Tente novamente.');
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

  // Continuar com criação do followup
  await continuarCriacaoFollowup(ctx, session, novoCliente);
  return true;
}

// ============================================================================
// DADOS DO FOLLOWUP
// ============================================================================
async function handleTituloFollowup(ctx: Context, session: any, titulo: string): Promise<boolean> {
  if (!titulo || titulo.length < 3) {
    await ctx.reply('Por favor, forneça um título mais específico (mínimo 3 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'selecionar_estagio',
      data: { ...session.data, titulo },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    `✅ **Título:** ${titulo}\n\n` +
    `🎯 **Selecione o estágio atual da oportunidade:**`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Prospecção', 'estagio_prospeccao')],
        [Markup.button.callback('📋 Apresentação', 'estagio_apresentacao')],
        [Markup.button.callback('💰 Proposta', 'estagio_proposta')],
        [Markup.button.callback('🤝 Negociação', 'estagio_negociacao')],
        [Markup.button.callback('✅ Fechamento', 'estagio_fechamento')]
      ])
    }
  );
  return true;
}

async function handleValorEstimado(ctx: Context, session: any, valorTexto: string): Promise<boolean> {
  let valor = null;

  if (valorTexto.toLowerCase() !== 'pular') {
    // Limpar e validar valor
    const valorLimpo = valorTexto.replace(/[^\d,.-]/g, '').replace(',', '.');
    const valorNumerico = parseFloat(valorLimpo);

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      await ctx.reply('Por favor, digite um valor válido ou "pular".\n\nExemplo: 15000 ou R$ 15.000');
      return true;
    }

    valor = valorNumerico;
  }

  // ✅ CORREÇÃO: Atualizar step para data digitada
  await adminSupabase
    .from('sessions')
    .update({
      step: 'data_prevista',
      data: { ...session.data, valor_estimado: valor },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  const valorFormatado = valor 
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
    : 'Não informado';

  // ✅ CORREÇÃO: Usar padrão dos lembretes
  await ctx.reply(
    `✅ **Valor estimado:** ${valorFormatado}\n\n` +
    `📅 **Data prevista para fechamento:**`,
    { parse_mode: 'Markdown' }
  );

  // ✅ SEGUNDA mensagem COM teclado (igual lembrete)
  await ctx.reply(
    'Digite a data no formato DD/MM/YYYY ou digite "pular":',
    Markup.keyboard([
      ['Hoje', 'Amanhã', 'Pular']
    ]).oneTime().resize()
  );

  return true;
}

async function handleDataPrevista(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  try {
    // ✅ CORREÇÃO: Verificar se quer pular
    if (dataTexto.toLowerCase() === 'pular') {
      await adminSupabase
        .from('sessions')
        .update({
          step: 'proxima_acao',
          data: { ...session.data, data_prevista: null },
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);

      await ctx.reply(
        `⏭️ **Data prevista:** Não informada\n\n` +
        `🎬 Digite a **próxima ação** a ser realizada:\n\n` +
        `Exemplos: "Agendar reunião", "Enviar proposta", "Fazer follow-up"`,
        {
          parse_mode: 'Markdown',
          ...Markup.removeKeyboard()
        }
      );
      return true;
    }

    // Parse da data normalmente
    const dataProcessada = parseDataBrasil(dataTexto);
    
    if (!dataProcessada || estaNoPassadoBrasil(dataProcessada)) {
      await ctx.reply(
        'Data inválida ou no passado. Por favor, use um formato válido ou digite "pular":\n\n' +
        'Exemplos: "25/07", "sexta-feira", "próxima segunda", "30 de julho"',
        Markup.keyboard([
          ['Hoje', 'Amanhã', 'Pular']
        ]).oneTime().resize()
      );
      return true;
    }

    // Converter para UTC
    const dataUTC = brasilParaUTC(dataProcessada);

    // Atualizar sessão
    await adminSupabase
      .from('sessions')
      .update({
        step: 'proxima_acao',
        data: { ...session.data, data_prevista: dataUTC.toISOString() },
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    const dataFormatada = format(dataProcessada, 'dd/MM/yyyy', { locale: ptBR });
    
    await ctx.reply(
      `✅ **Data prevista:** ${dataFormatada}\n\n` +
      `🎬 Digite a **próxima ação** a ser realizada:\n\n` +
      `Exemplos: "Agendar reunião", "Enviar proposta", "Fazer follow-up"`,
      {
        parse_mode: 'Markdown',
        ...Markup.removeKeyboard()
      }
    );
    return true;
  } catch (error) {
    console.error('Erro ao processar data:', error);
    await ctx.reply('Erro ao processar data. Tente novamente.');
    return true;
  }
}

async function handleProximaAcao(ctx: Context, session: any, proximaAcao: string): Promise<boolean> {
  if (!proximaAcao || proximaAcao.length < 3) {
    await ctx.reply('Por favor, descreva a próxima ação (mínimo 3 caracteres).');
    return true;
  }

  try {
    // Criar followup no banco
    const followupData = {
      user_id: session.user_id,
      cliente_id: session.data.cliente_id,
      titulo: session.data.titulo,
      estagio: session.data.estagio,
      valor_estimado: session.data.valor_estimado,
      data_inicio: new Date().toISOString(),
      data_prevista: session.data.data_prevista,
      ultimo_contato: new Date().toISOString(),
      proxima_acao: proximaAcao,
      status: 'ativo' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: novoFollowup, error: followupError } = await adminSupabase
      .from('followups')
      .insert(followupData)
      .select('id')
      .single();

    if (followupError || !novoFollowup) {
      console.error('Erro ao criar followup:', followupError);
      await ctx.reply('Erro ao criar follow-up. Tente novamente.');
      return true;
    }

    // Limpar sessão
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('id', session.id);

    // Buscar dados completos para mostrar
    const { data: followupCompleto } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', novoFollowup.id)
      .single();

    const cliente = Array.isArray(followupCompleto?.clientes) 
      ? followupCompleto.clientes[0] 
      : followupCompleto?.clientes;

    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';
    const estagioTexto = getEstagioTexto(session.data.estagio);

    await ctx.reply(
      `🎉 **Follow-up criado com sucesso!**\n\n` +
      `🏢 **Cliente:** ${nomeEmpresa}\n` +
      `📋 **Título:** ${session.data.titulo}\n` +
      `🎯 **Estágio:** ${estagioTexto}\n` +
      `🎬 **Próxima ação:** ${proximaAcao}\n\n` +
      `🔔 **Deseja configurar uma notificação?**`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔕 Não', `notif_followup_nao_${novoFollowup.id}`),
            Markup.button.callback('⏰ 1 hora antes', `notif_followup_1h_${novoFollowup.id}`)
          ],
          [
            Markup.button.callback('📅 24 horas antes', `notif_followup_24h_${novoFollowup.id}`),
            Markup.button.callback('📆 3 dias antes', `notif_followup_3d_${novoFollowup.id}`)
          ]
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
async function handleRegistrarContatoTexto(ctx: Context, session: any, descricaoContato: string): Promise<boolean> {
  if (!descricaoContato || descricaoContato.length < 3) {
    await ctx.reply('Por favor, descreva o contato realizado (mínimo 3 caracteres).');
    return true;
  }

  // Atualizar sessão
  await adminSupabase
    .from('sessions')
    .update({
      step: 'proxima_acao_contato',
      data: { ...session.data, contato_descricao: descricaoContato },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    `✅ **Contato registrado:** ${descricaoContato}\n\n` +
    `🎬 Digite a **próxima ação** a ser realizada:`,
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
    const followupId = session.data.followup_id;
    const agora = new Date().toISOString();

    // ✅ INSERIR CONTATO NO BANCO
    const { error: insertError } = await adminSupabase
      .from('contatos_followup')
      .insert({
        followup_id: followupId,
        user_id: session.user_id,
        data_contato: agora,
        tipo_contato: 'reuniao', // Tipo padrão
        resumo: session.data.contato_descricao || 'Contato registrado',
        proxima_acao: proximaAcao,
        created_at: agora
      });

    if (insertError) {
      console.error('Erro ao inserir contato:', insertError);
      await ctx.reply('Erro ao registrar contato. Tente novamente.');
      return true;
    }

    // ✅ ATUALIZAR FOLLOWUP
    const { error: updateError } = await adminSupabase
      .from('followups')
      .update({
        ultimo_contato: agora,
        proxima_acao: proximaAcao,
        updated_at: agora
      })
      .eq('id', followupId);

    if (updateError) {
      console.error('Erro ao atualizar followup:', updateError);
      await ctx.reply('Erro ao registrar contato. Tente novamente.');
      return true;
    }

    // ✅ BUSCAR DADOS ATUALIZADOS PARA MOSTRAR
    const { data: followupAtualizado, error: fetchError } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', followupId)
      .single();

    const cliente = Array.isArray(followupAtualizado?.clientes) 
      ? followupAtualizado.clientes[0] 
      : followupAtualizado?.clientes;

    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';

    // ✅ CORREÇÃO: Atualizar sessão para step de data
    await adminSupabase
      .from('sessions')
      .update({
        step: 'data_proxima_acao_contato',
        data: { 
          ...session.data, 
          proxima_acao: proximaAcao,
          contato_registrado: true
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    // ✅ CORREÇÃO: Usar padrão dos lembretes
    await ctx.reply(
      `✅ **Contato registrado com sucesso!**\n\n` +
      `🏢 **Cliente:** ${nomeEmpresa}\n` +
      `📝 **Resumo:** ${session.data.contato_descricao}\n` +
      `🎬 **Próxima ação:** ${proximaAcao}\n\n` +
      `📅 **QUANDO você quer realizar esta ação?**`,
      { parse_mode: 'Markdown' }
    );

    // ✅ SEGUNDA mensagem COM teclado (igual lembrete)
    await ctx.reply(
      'Digite a data no formato DD/MM/YYYY:',
      Markup.keyboard([
        ['Hoje', 'Amanhã']
      ]).oneTime().resize()
    );

    return true;
  } catch (error) {
    console.error('Erro ao finalizar registro de contato:', error);
    await ctx.reply('Erro ao registrar contato. Tente novamente.');
    return true;
  }
}

// ============================================================================
// ✅ FUNÇÃO CORRIGIDA: handleDataProximaAcaoContato (IGUAL LEMBRETE)
// ============================================================================
async function handleDataProximaAcaoContato(ctx: Context, session: any, dataTexto: string): Promise<boolean> {
  const data = parseDataTexto(dataTexto);
  
  if (!data) {
    await ctx.reply(
      'Data inválida. Por favor, use o formato DD/MM/YYYY ou digite "hoje" ou "amanhã".',
      Markup.keyboard([
        ['Hoje', 'Amanhã']
      ]).oneTime().resize()
    );
    return true;
  }

  // Verificar se a data não é no passado
  const agora = new Date();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  
  if (data < hoje) {
    await ctx.reply(
      'Não é possível agendar ações para datas passadas. Por favor, digite uma data futura.',
      Markup.keyboard([
        ['Hoje', 'Amanhã']
      ]).oneTime().resize()
    );
    return true;
  }

  await adminSupabase
    .from('sessions')
    .update({
      step: 'horario_proxima_acao',
      data: { 
        ...session.data, 
        data_texto: dataTexto, 
        data_selecionada: data.toISOString() 
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', session.id);

  await ctx.reply(
    'Digite o horário no formato HH:MM:\n\nExemplo: 14:30',
    Markup.removeKeyboard()
  );
  return true;
}

// ============================================================================
// ✅ FUNÇÃO NOVA: handleHorarioProximaAcao (IGUAL LEMBRETE)
// ============================================================================
async function handleHorarioProximaAcao(ctx: Context, session: any, horaTexto: string): Promise<boolean> {
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

  const followupId = session.data.followup_id;
  const proximaAcao = session.data.proxima_acao;
  
  const dataBrasil = new Date(dataUTC.getTime() - (3 * 60 * 60 * 1000));
  const mensagemData = format(dataBrasil, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  // Limpar sessão
  await adminSupabase
    .from('sessions')
    .delete()
    .eq('id', session.id);

  await ctx.reply(
    `📋 **RESUMO COMPLETO**\n\n` +
    `🎬 **Próxima ação:** ${proximaAcao}\n` +
    `📅 **Quando fazer:** ${mensagemData}\n\n` +
    `🔔 **Deseja configurar um lembrete?**`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🔕 Não', `notif_contato_nao_${followupId}`),
          Markup.button.callback('⏰ 15 min antes', `notif_contato_15m_${followupId}`)
        ],
        [
          Markup.button.callback('⏰ 1 hora antes', `notif_contato_1h_${followupId}`),
          Markup.button.callback('📅 1 dia antes', `notif_contato_24h_${followupId}`)
        ]
      ])
    }
  );

  return true;
}

// ============================================================================
// FUNÇÃO AUXILIAR PARA CONTINUAR CRIAÇÃO DE FOLLOWUP
// ============================================================================
async function continuarCriacaoFollowup(ctx: Context, session: any, cliente: any) {
  try {
    // Atualizar sessão com dados do cliente
    await adminSupabase
      .from('sessions')
      .update({
        step: 'titulo_followup',
        data: {
          ...session.data,
          cliente_id: cliente.id,
          nome_cliente: cliente.nome_empresa,
          contato_nome: cliente.contato_nome
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', session.id);

    const contatoInfo = cliente.contato_nome ? ` - ${cliente.contato_nome}` : '';
    
    await ctx.reply(
      `✅ **Cliente selecionado:**\n` +
      `🏢 ${cliente.nome_empresa}${contatoInfo}\n\n` +
      `📋 Digite o **título** do follow-up:\n\n` +
      `Exemplos: "Proposta sistema", "Reunião apresentação", "Follow-up orçamento"`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Erro ao continuar criação:', error);
    await ctx.reply('Erro ao processar. Tente novamente.');
  }
}

// ============================================================================
// ✅ FUNÇÃO AUXILIAR PARA PARSE DE DATA (IGUAL LEMBRETE)
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