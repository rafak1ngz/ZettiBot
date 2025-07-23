// ============================================================================
// HANDLERS DO MÓDULO FOLLOWUP - VERSÃO FINAL COM DATAS PADRONIZADAS
// ============================================================================

import { Context } from 'telegraf';
import { Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utcParaBrasil } from '@/utils/timezone';
import { 
  EstagioFollowup, 
  StatusFollowup, 
  getEstagioEmoji, 
  getEstagioTexto, 
  getStatusTexto,
  isValidStatus 
} from './types';

// ============================================================================
// UTILITÁRIO PARA FORMATAÇÃO SEGURA DE DATA
// ============================================================================
function formatarDataSegura(dataString: any): string {
  if (!dataString) return 'Não definida';
  
  try {
    const dataUTC = typeof dataString === 'string' ? new Date(dataString) : dataString;
    
    // Verificar se é uma data válida
    if (!(dataUTC instanceof Date) || !dataUTC.getTime || isNaN(dataUTC.getTime())) {
      return 'Data inválida';
    }
    
    // ✅ CORRIGIDO: Usar mesmo formato da agenda e lembretes
    return format(utcParaBrasil(dataUTC), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Erro na data';
  }
}

// ============================================================================
// UTILITÁRIO PARA EMOJI DE TIPO DE CONTATO
// ============================================================================
function getEmojiTipoContato(tipoContato: string): string {
  const tipoEmojiMap: Record<string, string> = {
    'ligacao': '📞',
    'email': '📧', 
    'reuniao': '🤝',
    'whatsapp': '💬',
    'visita': '🏢',
    'outro': '📝'
  };
  
  return tipoEmojiMap[tipoContato] || '📝';
}

// ============================================================================
// MENU PRINCIPAL DO FOLLOWUP
// ============================================================================
export async function handleFollowup(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado. Use /inicio para registrar-se.');
    }

    // Buscar estatísticas
    const { data: followups, error } = await adminSupabase
      .from('followups')
      .select('status, valor_estimado')
      .eq('user_id', userId);

    if (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return ctx.reply('Erro ao carregar estatísticas.');
    }

    // Calcular estatísticas
    const totalAtivos = followups?.filter(f => f.status === 'ativo').length || 0;
    const totalGanhos = followups?.filter(f => f.status === 'ganho').length || 0;
    const totalPerdidos = followups?.filter(f => f.status === 'perdido').length || 0;
    
    const valorTotal = followups
      ?.filter(f => f.status === 'ativo' && f.valor_estimado)
      .reduce((sum, f) => sum + (f.valor_estimado || 0), 0) || 0;

    const valorFormatado = valorTotal > 0 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotal)
      : 'R$ 0,00';

    return ctx.reply(`
🎯 **Follow-up Dashboard**

📊 **Estatísticas:**
🔄 Ativos: ${totalAtivos}
✅ Ganhos: ${totalGanhos}
❌ Perdidos: ${totalPerdidos}
💰 Pipeline: ${valorFormatado}

O que deseja fazer?
    `, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
          Markup.button.callback('📋 Listar Ativos', 'followup_listar_ativos')
        ],
        [
          Markup.button.callback('✅ Follow-ups Ganhos', 'followup_listar_ganhos'),
          Markup.button.callback('❌ Follow-ups Perdidos', 'followup_listar_perdidos')
        ],
        [
          Markup.button.callback('🏠 Menu Principal', 'menu_principal')
        ]
      ])
    });

  } catch (error) {
    console.error('Erro no menu followup:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// NOVO FOLLOWUP
// ============================================================================
export async function handleNovoFollowup(ctx: Context) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado para usar este comando.');
    }

    const telegramId = ctx.from?.id;
    if (!telegramId) {
      return ctx.reply('Não foi possível identificar seu usuário.');
    }

    // Limpar sessões existentes
    const { error: deleteError } = await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    if (deleteError) {
      console.error('Erro ao limpar sessão:', deleteError);
    }

    // Criar nova sessão para followup
    const { error: insertError } = await adminSupabase
      .from('sessions')
      .insert([{
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'escolher_cliente',
        data: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }]);

    if (insertError) {
      console.error('Erro ao criar sessão:', insertError);
      return ctx.reply('Erro ao iniciar processo. Tente novamente.');
    }

    await ctx.editMessageText(`🆕 **Novo Follow-up**

Como deseja proceder?`, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Buscar Cliente Existente', 'followup_buscar_cliente')],
        [Markup.button.callback('🆕 Criar Novo Cliente', 'followup_criar_cliente')],
        [Markup.button.callback('❌ Cancelar', 'cancelar_acao')]
      ])
    });
    
  } catch (error) {
    console.error('Erro em handleNovoFollowup:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// LISTAR FOLLOWUPS POR STATUS
// ============================================================================
export async function handleListarFollowups(ctx: Context, status: StatusFollowup) {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Validar status
    if (!isValidStatus(status)) {
      return ctx.reply('Status inválido.');
    }

    // Mostrar loading
    const loadingMsg = await ctx.reply('🔄 Carregando follow-ups...');

    // Buscar followups
    const { data: followups, error } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar followups:', error);
      await ctx.deleteMessage(loadingMsg.message_id);
      await ctx.reply('Erro ao buscar follow-ups. Tente novamente.');
      return;
    }

    if (!followups || followups.length === 0) {
      await ctx.deleteMessage(loadingMsg.message_id);
      
      const statusTexto = getStatusTexto(status).toLowerCase();

      return ctx.reply(
        `Você não possui follow-ups ${statusTexto}.`, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🆕 Criar Follow-up', 'followup_novo')],
            [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
          ])
        }
      );
    }

    // Deletar mensagem de loading
    await ctx.deleteMessage(loadingMsg.message_id);

    // Mostrar followups com paginação
    await mostrarFollowupsPaginados(ctx, followups, 0, status);

  } catch (error) {
    console.error('Erro ao listar followups por status:', error);
    await ctx.reply('Ocorreu um erro. Por favor, tente novamente.');
  }
}

// ============================================================================
// PAGINAÇÃO DE FOLLOWUPS - VERSÃO ROBUSTA CORRIGIDA
// ============================================================================
export async function mostrarFollowupsPaginados(ctx: Context, todosFollowups: any[], pagina: number, status: StatusFollowup) {
  try {
    const followupsPorPagina = 3;
    const inicio = pagina * followupsPorPagina;
    const fim = inicio + followupsPorPagina;
    const followupsPagina = todosFollowups.slice(inicio, fim);
    const totalPaginas = Math.ceil(todosFollowups.length / followupsPorPagina);

    const statusTexto = getStatusTexto(status);

    // Cabeçalho com contador
    await ctx.reply(`**${statusTexto}** (${pagina + 1}/${totalPaginas}) - Total: ${todosFollowups.length}`, {
      parse_mode: 'Markdown'
    });

    // Mostrar followups da página atual
    for (const followup of followupsPagina) {
      try {
        // ✅ CORRIGIDO: Verificar se clientes é array ou objeto
        const cliente = Array.isArray(followup.clientes) 
          ? followup.clientes[0] 
          : followup.clientes;

        const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';
        const nomeContato = cliente?.contato_nome || 'Contato não informado';
        
        const valorFormatado = followup.valor_estimado 
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(followup.valor_estimado)
          : 'Não informado';
          
        // ✅ CORRIGIDO: Usar função segura para formatar data
        const dataFormatada = formatarDataSegura(followup.data_prevista);

        const mensagemFollowup = `**${followup.titulo}**\n\n` +
          `🏢 **Cliente:** ${nomeEmpresa}\n` +
          `👤 **Contato:** ${nomeContato}\n` +
          `${getEstagioEmoji(followup.estagio)} **Estágio:** ${getEstagioTexto(followup.estagio)}\n` +
          `💰 **Valor:** ${valorFormatado}\n` +
          `📅 **Previsão:** ${dataFormatada}\n` +
          `📝 **Próxima Ação:** ${followup.proxima_acao || 'Não definida'}`;

        const botoes = [];
        
        // Botões específicos por status
        if (status === 'ativo') {
          botoes.push([
            Markup.button.callback('📞 Registrar Contato', `followup_contato_${followup.id}`),
            Markup.button.callback('✏️ Editar', `followup_editar_${followup.id}`)
          ]);
          botoes.push([
            Markup.button.callback('📋 Ver Histórico', `followup_historico_${followup.id}`),
            Markup.button.callback('📋 Ver Detalhes', `followup_detalhes_${followup.id}`)
          ]);
          botoes.push([
            Markup.button.callback('✅ Marcar como Ganho', `followup_ganho_${followup.id}`),
            Markup.button.callback('❌ Marcar como Perdido', `followup_perdido_${followup.id}`)
          ]);
        } else {
          botoes.push([
            Markup.button.callback('📋 Ver Histórico', `followup_historico_${followup.id}`),
            Markup.button.callback('📋 Ver Detalhes', `followup_detalhes_${followup.id}`)
          ]);
        }

        await ctx.reply(mensagemFollowup, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard(botoes)
        });
      } catch (itemError) {
        console.error('Erro ao processar item de followup:', itemError);
        await ctx.reply(`❌ Erro ao exibir follow-up: ${followup.titulo || 'Sem título'}`);
      }
    }

    // Botões de navegação
    const botoesNavegacao = [];
    
    if (totalPaginas > 1) {
      const navButtons = [];
      
      if (pagina > 0) {
        navButtons.push(Markup.button.callback('⬅️ Anterior', `followup_pagina_${status}_${pagina - 1}`));
      }
      
      if (pagina < totalPaginas - 1) {
        navButtons.push(Markup.button.callback('➡️ Próxima', `followup_pagina_${status}_${pagina + 1}`));
      }
      
      if (navButtons.length > 0) {
        botoesNavegacao.push(navButtons);
      }
    }

    botoesNavegacao.push([
      Markup.button.callback('🆕 Novo Follow-up', 'followup_novo'),
      Markup.button.callback('📊 Follow-up Menu', 'menu_followup')
    ]);
    botoesNavegacao.push([Markup.button.callback('🏠 Menu Principal', 'menu_principal')]);

    await ctx.reply('📍 **Navegação:**', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(botoesNavegacao)
    });

  } catch (error) {
    console.error('Erro na paginação de followups:', error);
    await ctx.reply('Erro ao exibir followups. Tente novamente.');
  }
}

// ============================================================================
// REGISTRAR CONTATO
// ============================================================================
export async function handleRegistrarContato(ctx: Context, followupId: string) {
  try {
    const userId = ctx.state.user?.id;
    const telegramId = ctx.from?.id;
    
    if (!userId || !telegramId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Buscar followup
    const { data: followup, error } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', followupId)
      .eq('user_id', userId)
      .single();

    if (error || !followup) {
      return ctx.reply('Follow-up não encontrado.');
    }

    // Limpar sessão anterior
    await adminSupabase
      .from('sessions')
      .delete()
      .eq('telegram_id', telegramId);

    // Criar nova sessão
    const { error: sessionError } = await adminSupabase
      .from('sessions')
      .insert({
        telegram_id: telegramId,
        user_id: userId,
        command: 'followup',
        step: 'registrar_contato',
        data: { followup_id: followupId },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (sessionError) {
      console.error('Erro ao criar sessão:', sessionError);
      return ctx.reply('Erro ao iniciar registro de contato.');
    }

    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';

    await ctx.reply(
      `📞 **Registrar Contato**\n\n` +
      `**Follow-up:** ${followup.titulo}\n` +
      `**Cliente:** ${nomeEmpresa}\n\n` +
      `Descreva o contato realizado:`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Erro ao registrar contato:', error);
    await ctx.reply('Ocorreu um erro ao processar sua solicitação.');
  }
}

// ============================================================================
// VER HISTÓRICO DE CONTATOS
// ============================================================================
export async function handleVerHistoricoContatos(ctx: Context, followupId: string) {
  try {
    const userId = ctx.state.user?.id;
    
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Buscar dados do follow-up
    const { data: followup, error: followupError } = await adminSupabase
      .from('followups')
      .select(`
        titulo,
        estagio,
        clientes (
          nome_empresa,
          contato_nome
        )
      `)
      .eq('id', followupId)
      .eq('user_id', userId)
      .single();

    if (followupError || !followup) {
      return ctx.reply('Follow-up não encontrado.');
    }

    // Buscar histórico de contatos
    const { data: contatos, error: contatosError } = await adminSupabase
      .from('contatos_followup')
      .select('*')
      .eq('followup_id', followupId)
      .eq('user_id', userId)
      .order('data_contato', { ascending: false });

    if (contatosError) {
      console.error('Erro ao buscar histórico:', contatosError);
      return ctx.reply('Erro ao carregar histórico de contatos.');
    }

    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';
    const nomeContato = cliente?.contato_nome || '';
    
    const estagioEmoji = getEstagioEmoji(followup.estagio);
    const estagioTexto = getEstagioTexto(followup.estagio);

    // Cabeçalho
    await ctx.reply(
      `📋 **Histórico de Contatos**\n\n` +
      `${estagioEmoji} **${followup.titulo}**\n` +
      `🏢 ${nomeEmpresa}${nomeContato ? ` - ${nomeContato}` : ''}\n` +
      `🎯 ${estagioTexto}`,
      { parse_mode: 'Markdown' }
    );

    if (!contatos || contatos.length === 0) {
      return ctx.reply(
        `📝 **Nenhum contato registrado ainda**\n\n` +
        `Este follow-up ainda não possui histórico de contatos.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📞 Registrar Primeiro Contato', `followup_contato_${followupId}`)],
            [Markup.button.callback('🔙 Voltar', 'voltar_followups')]
          ])
        }
      );
    }

    // Mostrar histórico
    await ctx.reply(`📞 **${contatos.length} contato(s) registrado(s):**`, { parse_mode: 'Markdown' });

    for (let i = 0; i < Math.min(contatos.length, 5); i++) {
      const contato = contatos[i];
      const dataContato = new Date(contato.data_contato);
      // ✅ CORRIGIDO: Usar padrão da agenda e lembretes
      const dataFormatada = format(utcParaBrasil(dataContato), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      const tipoEmoji = getEmojiTipoContato(contato.tipo_contato);

      await ctx.reply(
        `${tipoEmoji} **Contato ${i + 1}**\n` +
        `📅 ${dataFormatada}\n\n` +
        `**Resumo:**\n${contato.resumo}\n\n` +
        `**Próxima ação definida:**\n${contato.proxima_acao || 'Não definida'}`,
        { parse_mode: 'Markdown' }
      );
    }

    // Se houver mais contatos, mostrar resumo
    if (contatos.length > 5) {
      await ctx.reply(
        `📊 **Resumo:** Mostrando os 5 contatos mais recentes de ${contatos.length} total.\n\n` +
        `💡 **Dica:** Mantenha seu histórico sempre atualizado para um follow-up mais eficiente!`,
        { parse_mode: 'Markdown' }
      );
    }

    // Botões de ação
    await ctx.reply(
      `O que deseja fazer?`,
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📞 Novo Contato', `followup_contato_${followupId}`),
            Markup.button.callback('✏️ Editar Follow-up', `followup_editar_${followupId}`)
          ],
          [
            Markup.button.callback('🔄 Ver Follow-ups', 'followup_listar_ativos'),
            Markup.button.callback('🏠 Menu Principal', 'menu_principal')
          ]
        ])
      }
    );

  } catch (error) {
    console.error('Erro ao mostrar histórico:', error);
    await ctx.reply('Ocorreu um erro ao carregar histórico.');
  }
}

// ============================================================================
// VER DETALHES COMPLETOS DO FOLLOW-UP
// ============================================================================
export async function handleVerDetalhesFollowup(ctx: Context, followupId: string) {
  try {
    const userId = ctx.state.user?.id;
    
    if (!userId) {
      return ctx.reply('Você precisa estar autenticado.');
    }

    // Buscar dados completos do follow-up
    const { data: followup, error: followupError } = await adminSupabase
      .from('followups')
      .select(`
        *,
        clientes (
          nome_empresa,
          contato_nome,
          contato_telefone,
          contato_email,
          cnpj
        )
      `)
      .eq('id', followupId)
      .eq('user_id', userId)
      .single();

    if (followupError || !followup) {
      return ctx.reply('Follow-up não encontrado.');
    }

    // Buscar quantidade de contatos registrados
    const { data: contatos, error: contatosError } = await adminSupabase
      .from('contatos_followup')
      .select('id')
      .eq('followup_id', followupId)
      .eq('user_id', userId);

    const totalContatos = contatos?.length || 0;

    const cliente = Array.isArray(followup.clientes) ? followup.clientes[0] : followup.clientes;
    
    // Dados do cliente
    const nomeEmpresa = cliente?.nome_empresa || 'Cliente não encontrado';
    const nomeContato = cliente?.contato_nome || '';
    const telefone = cliente?.contato_telefone || '';
    const email = cliente?.contato_email || '';
    const cnpj = cliente?.cnpj || '';
    
    // Dados do follow-up
    const estagioEmoji = getEstagioEmoji(followup.estagio);
    const estagioTexto = getEstagioTexto(followup.estagio);
    const statusTexto = getStatusTexto(followup.status);
    
    const valorFormatado = followup.valor_estimado 
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(followup.valor_estimado)
      : 'Não informado';
      
    // ✅ CORRIGIDO: Usar padrão da agenda e lembretes
    const dataInicioFormatada = format(utcParaBrasil(new Date(followup.data_inicio)), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    const ultimoContatoFormatado = format(utcParaBrasil(new Date(followup.ultimo_contato)), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    
    const dataPrevisaoFormatada = followup.data_prevista 
      ? formatarDataSegura(followup.data_prevista)
      : 'Não definida';

    // Montar mensagem detalhada
    let mensagemDetalhes = `📋 **DETALHES COMPLETOS**\n\n`;
    
    // Seção do Follow-up
    mensagemDetalhes += `${estagioEmoji} **${followup.titulo}**\n`;
    mensagemDetalhes += `🎯 **Status:** ${statusTexto}\n`;
    mensagemDetalhes += `📊 **Estágio:** ${estagioTexto}\n`;
    mensagemDetalhes += `💰 **Valor estimado:** ${valorFormatado}\n\n`;
    
    // Seção do Cliente
    mensagemDetalhes += `👥 **DADOS DO CLIENTE**\n`;
    mensagemDetalhes += `🏢 **Empresa:** ${nomeEmpresa}\n`;
    if (nomeContato) mensagemDetalhes += `👤 **Contato:** ${nomeContato}\n`;
    if (telefone) mensagemDetalhes += `📞 **Telefone:** ${telefone}\n`;
    if (email) mensagemDetalhes += `📧 **Email:** ${email}\n`;
    if (cnpj) mensagemDetalhes += `📋 **CNPJ:** ${cnpj}\n`;
    mensagemDetalhes += `\n`;
    
    // Seção de Timeline
    mensagemDetalhes += `⏰ **TIMELINE**\n`;
    mensagemDetalhes += `📅 **Criado em:** ${dataInicioFormatada}\n`;
    mensagemDetalhes += `🕐 **Último contato:** ${ultimoContatoFormatado}\n`;
    mensagemDetalhes += `📈 **Previsão fechamento:** ${dataPrevisaoFormatada}\n`;
    mensagemDetalhes += `📞 **Total de contatos:** ${totalContatos}\n\n`;
    
    // Seção de Próxima Ação
    mensagemDetalhes += `🎬 **PRÓXIMA AÇÃO**\n`;
    mensagemDetalhes += `${followup.proxima_acao || 'Não definida'}\n\n`;
    
    // Observações se houver
    if (followup.descricao) {
      mensagemDetalhes += `📝 **OBSERVAÇÕES**\n`;
      mensagemDetalhes += `${followup.descricao}`;
    }

    await ctx.reply(mensagemDetalhes, { parse_mode: 'Markdown' });

    // Botões de ação baseados no status
    let botoes = [];
    
    if (followup.status === 'ativo') {
      botoes = [
        [
          Markup.button.callback('📞 Registrar Contato', `followup_contato_${followupId}`),
          Markup.button.callback('✏️ Editar Follow-up', `followup_editar_${followupId}`)
        ],
        [
          Markup.button.callback('📋 Ver Histórico', `followup_historico_${followupId}`),
          Markup.button.callback('🔄 Ver Follow-ups', 'followup_listar_ativos')
        ],
        [
          Markup.button.callback('✅ Marcar como Ganho', `followup_ganho_${followupId}`),
          Markup.button.callback('❌ Marcar como Perdido', `followup_perdido_${followupId}`)
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ];
    } else {
      botoes = [
        [
          Markup.button.callback('📋 Ver Histórico', `followup_historico_${followupId}`),
          Markup.button.callback('🔄 Ver Follow-ups', `followup_listar_${followup.status}s`)
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ];
    }

    await ctx.reply(
      'O que deseja fazer?',
      Markup.inlineKeyboard(botoes)
    );

  } catch (error) {
    console.error('Erro ao mostrar detalhes do followup:', error);
    await ctx.reply('Ocorreu um erro ao carregar detalhes.');
  }
}