import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../src/services/supabase';
import { handleCommand } from '../../src/utils/commandHandler';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("Webhook recebido", new Date().toISOString());
  console.log("Método:", req.method);
  
  if (req.method !== 'POST') {
    console.log("Método não permitido:", req.method);
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { body } = req;
    console.log("Body recebido:", JSON.stringify(body));
    
    // Verificar se corpo é válido
    if (!body || !body.message) {
      console.log("Corpo inválido ou mensagem não encontrada");
      return res.status(200).json({ success: false, message: 'Invalid body' });
    }
    
    // Processar mensagem do Telegram
    const chatId = body.message.chat.id;
    const text = body.message.text || '';
    const userId = body.message.from.id;
    
    console.log(`Mensagem recebida - ChatID: ${chatId}, Texto: ${text}`);
    
    try {
      // Registrar ou atualizar usuário
      const { data, error } = await supabase
        .from('users')
        .upsert({
          telegram_id: userId.toString(),
          nome: body.message.from.first_name || 'Usuário',
          ultima_atividade: new Date().toISOString()
        });
      
      if (error) throw error;
      console.log("Usuário registrado/atualizado:", data);
    } catch (dbError) {
      console.error("Erro ao acessar banco de dados:", dbError);
    }
    
    // Processar comando
    try {
      await handleCommand(text, body.message);
    } catch (cmdError) {
      console.error("Erro ao processar comando:", cmdError);
    }
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao processar webhook:', error);
    return res.status(500).json({ success: false, error: 'Erro ao processar mensagem' });
  }
}