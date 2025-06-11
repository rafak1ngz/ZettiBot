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

export default async function handler(req, res) {
  // Verificar chave de segurança para evitar chamadas não autorizadas
  const securityKey = req.query.key;
  if (securityKey !== process.env.WEBHOOK_SECURITY_KEY) {
    return res.status(403).json({ error: 'Acesso não autorizado' });
  }

  try {
    // Buscar lembretes pendentes para a hora atual
    const lembretes = await dbService.buscarLembretesParaNotificar();
    
    // Log para depuração
    console.log(`Verificando lembretes: ${lembretes.length} encontrados`);
    
    // Enviar cada lembrete
    const resultados = await Promise.all(
      lembretes.map(lembrete => enviarLembrete(lembrete))
    );
    
    // Contar quantos foram enviados com sucesso
    const sucessos = resultados.filter(r => r === true).length;
    
    // Retornar resultados
    return res.status(200).json({
      verificados: lembretes.length,
      enviados: sucessos,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erro ao verificar lembretes:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar lembretes' });
  }
}

export const config = {
  api: {
    externalResolver: true,
  }
};