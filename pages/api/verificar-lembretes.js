import * as dbService from '../../lib/supabase';
import bot from '../../lib/telegram-bot';

// Função para enviar lembrete
const enviarLembrete = async (lembrete) => {
  try {
    console.log(`Iniciando envio de lembrete ID=${lembrete.id} para ${lembrete.telegram_id}`);
    let mensagem = `*LEMBRETE*\n\n${lembrete.texto}`;
    await bot.telegram.sendMessage(
      lembrete.telegram_id,
      mensagem,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Concluído', callback_data: `lembrete_concluir_${lembrete.id}` }],
            [{ text: 'Adiar', callback_data: `lembrete_adiar_${lembrete.id}` }]
          ]
        }
      }
    );
    await dbService.atualizarStatusLembrete(lembrete.id, 'enviado');
    console.log(`Lembrete ${lembrete.id} marcado como enviado`);
    return true;
  } catch (error) {
    console.error(`ERRO ao enviar lembrete ${lembrete.id}:`, error);
    return false;
  }
};

// Handler principal
export default async function handler(req, res) {
  try {
    const agora = new Date();
    const dataAtual = agora.toISOString().split('T')[0]; // YYYY-MM-DD
    const horaAtual = new Date(agora.getTime() - (3 * 60 * 60 * 1000)).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).replace(':', ''); // Formato HHMM sem dois pontos

    const lembretes = await dbService.buscarLembretesParaNotificar(dataAtual, horaAtual);
    let notificacoesEnviadas = 0;

    for (const lembrete of lembretes) {
      if (await enviarLembrete(lembrete)) {
        notificacoesEnviadas++;
      }
    }

    const followupsAtualizados = await atualizarFollowupsVencidos();
    res.status(200).json({
      message: `Notificados ${notificacoesEnviadas} lembretes e atualizados ${followupsAtualizados} follow-ups`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro na verificação de lembretes:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
}

// Função para atualizar follow-ups vencidos (mantida como estava, será ajustada na próxima etapa)
const atualizarFollowupsVencidos = async () => {
  try {
    const dataAtual = new Date().toISOString().split('T')[0];
    const { data: followups, error } = await dbService.supabase
      .from('followups')
      .select('*')
      .lt('data', dataAtual)
      .eq('status', 'A Realizar');
    if (error) throw error;
    let atualizados = 0;
    for (const followup of followups) {
      try {
        await dbService.atualizarStatusFollowUp(followup.id, 'Pendente');
        atualizados++;
        console.log(`Follow-up ${followup.id} atualizado para Pendente`);
      } catch (error) {
        console.error(`Erro ao atualizar follow-up ${followup.id}:`, error);
      }
    }
    return atualizados;
  } catch (error) {
    console.error('Erro ao processar follow-ups vencidos:', error);
    return 0;
  }
};