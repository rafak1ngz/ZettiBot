import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../services/supabase';
import { handleCommand } from '../../utils/commandHandler';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { body } = req;    
    
    // Processar mensagem do Telegram
    if (body && body.message) {
      const chatId = body.message.chat.id;
      const text = body.message.text || '';
      const userId = body.message.from.id;
      
      // Registrar ou atualizar usuário
      await supabase
        .from('users')
        .upsert({
          telegram_id: userId.toString(),
          nome: body.message.from.first_name || 'Usuário',
          ultima_atividade: new Date().toISOString()
        });
      
      // Processar comando
      await handleCommand(text, body.message);
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    return res.status(500).json({ success: false, error: 'Erro ao processar mensagem' });
  }
}