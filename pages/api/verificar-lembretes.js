import * as dbService from '../../lib/supabase';
import { Telegraf } from 'telegraf';

// Função para enviar lembretes
const enviarLembrete = async (lembrete) => {
  try {
    console.log(`🚀 Iniciando envio de lembrete ID=${lembrete.id} para ${lembrete.telegram_id}`);
    
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    
    // Formatar mensagem de lembrete
    let mensagem = `⏰ *LEMBRETE!* ⏰\n\n${lembrete.texto}`;
    
    // Adicionar detalhes do cliente se existir
    if (lembrete.cliente_id && lembrete.clientes) {
      mensagem += `\n\n🏢 *Cliente:* ${lembrete.clientes.nome_empresa}`;
    }
    
    console.log(`📤 Enviando mensagem para ${lembrete.telegram_id}:`, mensagem.substring(0, 50) + '...');
    
    // Enviar notificação
    await bot.telegram.sendMessage(
      lembrete.telegram_id, 
      mensagem,
      { parse_mode: 'Markdown' }
    );
    
    console.log(`✅ Mensagem enviada com sucesso para ${lembrete.telegram_id}`);
    
    // Marcar lembrete como enviado
    await dbService.atualizarStatusLembrete(lembrete.id, 'enviado');
    console.log(`📝 Lembrete ${lembrete.id} marcado como enviado`);
    
    return true;
  } catch (error) {
    console.error(`❌ ERRO ao enviar lembrete ${lembrete.id}:`, error);
    return false;
  }
};

const atualizarFollowupsVencidos = async () => {
  try {
    const dataAtual = new Date().toISOString().split('T')[0];
    
    // Buscar follow-ups vencidos
    const { data: followups, error } = await dbService.supabase
      .from('followups')
      .select('*')
      .lt('data', dataAtual)
      .eq('status', 'A Realizar');
    
    if (error) throw error;
    
    let atualizados = 0;
    
    // Atualizar status para "Pendente"
    for (const followup of followups) {
      try {
        await dbService.atualizarStatusFollowUp(followup.id, 'Pendente');
        atualizados++;
        console.log(`✅ Follow-up ${followup.id} atualizado para Pendente`);
      } catch (error) {
        console.error(`❌ Erro ao atualizar follow-up ${followup.id}:`, error);
      }
    }
    
    return atualizados;
  } catch (error) {
    console.error('❌ Erro ao processar follow-ups vencidos:', error);
    return 0;
  }
};

export default async function handler(req, res) {
  try {
    const agora = new Date();
    const dataAtual = agora.toISOString().split('T')[0];
    
    // Ajuste horário para Brasil
    const horaAtual = new Date(
      agora.getTime() - (3 * 60 * 60 * 1000) // Ajuste GMT-3
    ).toLocaleTimeString('pt-BR', {
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false
    });

    const lembretes = await dbService.buscarLembretesParaNotificar(dataAtual, horaAtual);
    
    const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
    
    for (const lembrete of lembretes) {
      try {
        await bot.telegram.sendMessage(
          lembrete.telegram_id, 
          `⏰ *LEMBRETE* ⏰\n\n${lembrete.texto}`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Concluído', callback_data: `lembrete_concluir_${lembrete.id}` },
                  { text: '⏰ Adiar', callback_data: `lembrete_adiar_${lembrete.id}` }
                ]
              ]
            }
          }
        );
        
        await dbService.marcarLembreteNotificado(lembrete.id);
      } catch (error) {
        console.error(`Erro ao notificar lembrete ${lembrete.id}:`, error);
      }
    }

    res.status(200).json({ 
      message: `Notificados ${lembretes.length} lembretes`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro na verificação de lembretes:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
}

export const config = {
  api: {
    externalResolver: true,
  }
};