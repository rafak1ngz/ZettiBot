import * as dbService from '../../lib/supabase';

export default async function handler(req, res) {
  // Verificar chave de segurança para evitar chamadas não autorizadas
  if (req.query.key !== process.env.WEBHOOK_SECURITY_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    // Buscar follow-ups vencidos (data menor que hoje e status ainda é "A Realizar")
    const dataAtual = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    const { data: followups, error } = await dbService.supabase
      .from('followups')
      .select('*')
      .lt('data', dataAtual)
      .eq('status', 'A Realizar');
    
    if (error) throw error;
    
    let atualizados = 0;
    
    // Atualizar status para "Pendente"
    for (const followup of followups) {
      await dbService.atualizarStatusFollowUp(followup.id, 'Pendente');
      atualizados++;
    }
    
    return res.status(200).json({ 
      message: `Verificação de follow-ups concluída`,
      followups_verificados: followups.length,
      status_atualizados: atualizados
    });
    
  } catch (error) {
    console.error('Erro ao verificar follow-ups vencidos:', error);
    return res.status(500).json({ error: 'Erro interno ao verificar follow-ups' });
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};