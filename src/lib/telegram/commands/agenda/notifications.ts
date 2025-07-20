import { Context, Markup } from 'telegraf';
import { adminSupabase } from '@/lib/supabase';
import { criarNotificacao } from '@/lib/telegram/notifications';
import { CompromissoQuery } from '@/types/database';
import { utcParaBrasil } from '@/utils/timezone';

export async function handleConfiguracoesNotificacao(ctx: Context, compromissoId: string) {
  try {
    await ctx.editMessageText(
      '⏰ Deseja receber lembrete deste compromisso?',
      Markup.inlineKeyboard([
        [Markup.button.callback('🔕 Não notificar', `notif_nao_${compromissoId}`)],
        [
          Markup.button.callback('⏰ 15 min antes', `notif_15m_${compromissoId}`),
          Markup.button.callback('⏰ 30 min antes', `notif_30m_${compromissoId}`)
        ],
        [
          Markup.button.callback('⏰ 1h antes', `notif_1h_${compromissoId}`),
          Markup.button.callback('⏰ 5h antes', `notif_5h_${compromissoId}`)
        ],
        [
          Markup.button.callback('⏰ 12h antes', `notif_12h_${compromissoId}`),
          Markup.button.callback('⏰ 24h antes', `notif_24h_${compromissoId}`)
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );
  } catch (error) {
    console.error('Erro ao mostrar configurações de notificação:', error);
    await ctx.reply('Ocorreu um erro ao configurar notificações.');
  }
}

export async function processarNotificacaoCompromisso(ctx: Context, tempo: string, compromissoId: string) {
  try {
    ctx.answerCbQuery();

    if (tempo === 'nao') {
      await ctx.editMessageText(
        '✅ Compromisso registrado com sucesso!\n🔕 Nenhuma notificação será enviada.',
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

    // Buscar dados do compromisso com cliente
    const { data: compromisso, error } = await adminSupabase
      .from('compromissos')
      .select(`
        *,
        clientes (
          nome_empresa
        )
      `)
      .eq('id', compromissoId)
      .single() as { data: CompromissoQuery | null, error: any };

    if (error || !compromisso) {
      console.error('Erro ao buscar compromisso:', error);
      await ctx.reply('Erro ao configurar notificação. Compromisso não encontrado.');
      return;
    }

    // Calcular tempo de antecedência
    const minutosAntes = {
      '15m': 15,
      '30m': 30,
      '1h': 60,
      '5h': 300,
      '12h': 720,
      '24h': 1440
    }[tempo] || 30;

    // ✅ CORREÇÃO: Trabalhar em UTC (servidor) vs UTC (banco)
    const agoraUTC = new Date(); // Servidor em UTC
    const dataCompromissoUTC = new Date(compromisso.data_compromisso); // Banco em UTC

    // Para exibir em brasileiro, converter UTC para Brasil (subtrair 3h)
    const agoraBrasil = new Date(agoraUTC.getTime() - (3 * 60 * 60 * 1000));
    const compromissoBrasil = new Date(dataCompromissoUTC.getTime() - (3 * 60 * 60 * 1000));

    console.log('=== DEBUG NOTIFICAÇÃO UTC ===');
    console.log('Agora UTC (servidor):', agoraUTC.toISOString());
    console.log('Compromisso UTC (banco):', dataCompromissoUTC.toISOString());
    console.log('Agora Brasil (display):', agoraBrasil.toLocaleString('pt-BR'));
    console.log('Compromisso Brasil (display):', compromissoBrasil.toLocaleString('pt-BR'));
    console.log('Minutos antes solicitados:', minutosAntes);

    // ✅ CÁLCULO: Diferença UTC vs UTC
    const diferencaMinutos = Math.floor((dataCompromissoUTC.getTime() - agoraUTC.getTime()) / (1000 * 60));
    console.log('Diferença até compromisso (minutos):', diferencaMinutos);

    // ✅ VALIDAÇÃO 1: Verificar se o compromisso não está no passado
    if (diferencaMinutos <= 0) {
      console.log('❌ Compromisso no passado ou acontecendo agora');
      await ctx.editMessageText(
        `⚠️ Este compromisso já passou ou está acontecendo agora.\n\n` +
        `✅ Compromisso registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }
    
    // ✅ VALIDAÇÃO 2: Verificar se há tempo suficiente para a notificação
    if (diferencaMinutos <= minutosAntes) {
      console.log('❌ Muito próximo para notificação');
      await ctx.editMessageText(
        `⚠️ Este compromisso é muito próximo para enviar notificação de ${minutosAntes} minutos antes.\n\n` +
        `⏰ Restam apenas ${diferencaMinutos} minutos até o compromisso.\n\n` +
        `✅ Compromisso registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    // ✅ CÁLCULO: Data da notificação
    const dataNotificacao = new Date(dataCompromissoUTC.getTime() - (minutosAntes * 60 * 1000));
    
    console.log('Data da notificação:', dataNotificacao.toLocaleString('pt-BR'));
    console.log('Minutos até notificação:', Math.floor((dataNotificacao.getTime() - agoraUTC.getTime()) / (1000 * 60)));
    console.log('✅ Tudo OK para criar notificação');
    console.log('===============================');

    // ✅ DADOS: Nome do cliente
    const nomeCliente = compromisso.clientes?.nome_empresa || 'Cliente não especificado';
    
    // ✅ CRIAR: Notificação no sistema
    const resultadoNotificacao = await criarNotificacao({
      user_id: compromisso.user_id,
      telegram_id: ctx.from!.id,
      tipo: 'agenda',
      titulo: 'Lembrete de Compromisso',
      mensagem: `📅 Compromisso em ${minutosAntes < 60 ? minutosAntes + ' minutos' : minutosAntes/60 + ' hora(s)'}!\n\n` +
                `🏢 ${nomeCliente}\n` +
                `📝 ${compromisso.titulo}\n` +
                `⏰ ${utcParaBrasil(dataCompromissoUTC).toLocaleString('pt-BR')}\n` +
                (compromisso.local ? `📍 ${compromisso.local}\n` : '') +
                (compromisso.descricao ? `💬 ${compromisso.descricao}` : ''),
      agendado_para: dataNotificacao
    });

    // ✅ VERIFICAR: Se a notificação foi criada com sucesso
    if (!resultadoNotificacao.sucesso) {
      console.error('Erro ao criar notificação:', resultadoNotificacao.erro);
      await ctx.editMessageText(
        `❌ Erro ao agendar notificação: ${resultadoNotificacao.erro}\n\n✅ Compromisso registrado sem notificação.`,
        Markup.inlineKeyboard([
          [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
        ])
      );
      return;
    }

    // ✅ SUCESSO: Confirmar criação da notificação
    const tempoTexto = {
      '15m': '15 minutos',
      '30m': '30 minutos', 
      '1h': '1 hora',
      '5h': '5 horas',
      '12h': '12 horas',
      '24h': '24 horas'
    }[tempo] || '30 minutos';

    await ctx.editMessageText(
      `✅ Compromisso registrado com sucesso!\n⏰ Você receberá um lembrete ${tempoTexto} antes.\n\n` +
      `📅 ${compromisso.titulo}\n🏢 ${nomeCliente}\n\n` +
      `🔔 Notificação agendada para: ${utcParaBrasil(dataNotificacao).toLocaleString('pt-BR')}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('➕ Novo Compromisso', 'agenda_novo'),
          Markup.button.callback('📋 Listar Compromissos', 'agenda_listar')
        ],
        [Markup.button.callback('🏠 Menu Principal', 'menu_principal')]
      ])
    );

  } catch (error) {
    console.error('Erro ao processar notificação:', error);
    await ctx.reply('Ocorreu um erro ao configurar a notificação.');
  }
}