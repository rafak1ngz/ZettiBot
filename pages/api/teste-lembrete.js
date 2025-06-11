import * as dbService from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    if (!req.query.key || req.query.key !== process.env.WEBHOOK_SECURITY_KEY) {
      return res.status(403).json({ error: 'Acesso não autorizado' });
    }
    
    const telegramId = req.query.telegram_id;
    if (!telegramId) {
      return res.status(400).json({ error: 'telegram_id é obrigatório' });
    }
    
    // Criar data e hora para 5 minutos no futuro
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() + 5);
    
    // Formatar data (YYYY-MM-DD)
    const data = agora.toISOString().split('T')[0];
    
    // Formatar hora (HH:MM)
    const hora = agora.getHours().toString().padStart(2, '0');
    const minutos = agora.getMinutes().toString().padStart(2, '0');
    const horario = `${hora}:${minutos}`;
    
    // Criar lembrete
    const lembreteData = {
      data,
      horario,
      texto: "🔔 Este é um lembrete de teste, criado automaticamente para verificar o sistema!",
      clienteId: null
    };
    
    // Salvar lembrete
    await dbService.adicionarLembrete(telegramId, lembreteData);
    
    return res.status(200).json({
      success: true,
      message: `Lembrete de teste criado para ${data} às ${horario} (daqui a 5 minutos)`,
      lembrete: lembreteData
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao criar lembrete de teste', details: error.message });
  }
}