// src/lib/telegram/commands/agenda/notifications.ts
import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { 
  agendarNotificacaoCompromisso,
  cancelarNotificacaoCompromisso,
  OPCOES_TEMPO_NOTIFICACAO,
  NO_NOTIFICATION,
  criarTemplateConfirmacao,
  criarTemplateNaoNotificar
} from '../../notifications';

/**
 * Mostrar opções de notificação após confirmar compromisso
 */
export async function mostrarOpcoesNotificacao(
  ctx: Context,
  compromissoId: string,
  dadosCompromisso: {
    titulo: string;
    data_compromisso: string;
    cliente_nome?: string;
    local?: string;
  }
): Promise<void> {
  try {
    // Criar botões de opções de tempo
    const botoesNotificacao = [];
    
    // Primeira linha: Não notificar
    botoesNotificacao.push([
      Markup.button.callback(NO_NOTIFICATION.label, `agenda_notify_none_${compromissoId}`)
    ]);

    // Adicionar opções de tempo em pares
    for (let i = 0; i < OPCOES_TEMPO_NOTIFICACAO.length; i += 2) {
      const linha = [];
      
      // Primeiro botão da linha
      const opcao1 = OPCOES_TEMPO_NOTIFICACAO[i];
      linha.push(
        Markup.button.callback(
          opcao1.label, 
          `agenda_notify_${opcao1.minutos_antes}_${compromissoId}`
        )
      );
      
      // Segundo botão da linha (se existir)
      if (i + 1 < OPCOES_TEMPO_NOTIFICACAO.length) {
        const opcao2 = OPCOES_TEMPO_NOTIFICACAO[i + 1];
        linha.push(
          Markup.button.callback(
            opcao2.label, 
            `agenda_notify_${opcao2.minutos_antes}_${compromissoId}`
          )
        );
      }
      
      botoesNotificacao.push(linha);
    }

    await ctx.editMessageText(
      `✅ Compromisso registrado com sucesso!\n\n` +
      `📅 **${dadosCompromisso.titulo}**\n\n` +
      `⏰ Deseja receber lembrete deste compromisso?`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(botoesNotificacao)
      }
    );

  } catch (error) {
    console.error('Erro ao mostrar opções de notificação:', error);
    
    // Fallback: mostrar menu básico
    await ctx.editMessageText(
      '✅ Compromisso registrado com sucesso!\n\n' +
      'O que deseja fazer agora?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
          Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );
  }
}

/**
 * Processar seleção de notificação
 */
export async function processarSelecaoNotificacao(
  ctx: Context,
  minutosAntes: number | null,
  compromissoId: string
): Promise<void> {
  try {
    const userId = ctx.state.user?.id;
    if (!userId) {
      await ctx.editMessageText('Erro: Usuário não identificado.');
      return;
    }

    // Se não quer notificação
    if (minutosAntes === null) {
      const mensagem = criarTemplateNaoNotificar();
      
      await ctx.editMessageText(
        mensagem,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
            Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    // Buscar dados do compromisso
    const { data: compromisso, error } = await adminSupabase
      .from('compromissos')
      .select(`
        id,
        titulo,
        data_compromisso,
        local,
        clientes (nome_empresa)
      `)
      .eq('id', compromissoId)
      .eq('user_id', userId)
      .single();

    if (error || !compromisso) {
      console.error('Erro ao buscar compromisso:', error);
      await ctx.editMessageText('Erro: Compromisso não encontrado.');
      return;
    }

    // Agendar notificação
    const resultado = await agendarNotificacaoCompromisso({
      compromisso_id: compromissoId,
      user_id: userId,
      minutos_antes: minutosAntes,
      data_compromisso: new Date(compromisso.data_compromisso),
      titulo_compromisso: compromisso.titulo,
      cliente_nome: compromisso.clientes?.nome_empresa,
      local: compromisso.local
    });

    if (!resultado.sucesso) {
      console.error('Erro ao agendar notificação:', resultado.erro);
      await ctx.editMessageText(
        `❌ Erro ao agendar notificação: ${resultado.erro}\n\n` +
        'Compromisso foi salvo, mas sem notificação.',
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    // Sucesso - mostrar confirmação
    const mensagemConfirmacao = criarTemplateConfirmacao(
      minutosAntes,
      compromisso.titulo
    );

    await ctx.editMessageText(
      mensagemConfirmacao,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
            Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
          ],
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      }
    );

  } catch (error) {
    console.error('Erro ao processar seleção de notificação:', error);
    await ctx.editMessageText(
      '❌ Erro inesperado ao configurar notificação.\n\n' +
      'Compromisso foi salvo, mas sem notificação.',
      Markup.inlineKeyboard([
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );
  }
}

/**
 * Função auxiliar para cancelar notificações ao excluir compromisso
 */
export async function cancelarNotificacoesCompromisso(
  compromissoId: string,
  userId: string
): Promise<void> {
  try {
    await cancelarNotificacaoCompromisso(compromissoId, userId);
  } catch (error) {
    console.error('Erro ao cancelar notificações do compromisso:', error);
    // Não falhar por isso, pois o compromisso já foi excluído
  }
}