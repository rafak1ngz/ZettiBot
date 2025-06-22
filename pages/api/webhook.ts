// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

// Endpoint para os webhooks do Telegram
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Webhook recebido:', req.method);
    
    // Se não for POST, responder com erro
    if (req.method !== 'POST') {
      console.log('Método não permitido:', req.method);
      return res.status(200).json({ ok: false, error: 'Método não permitido' });
    }
    
    // Log do corpo da requisição
    console.log('Body recebido:', JSON.stringify(req.body));
    
    // Verificar se é uma mensagem do Telegram
    if (req.body && req.body.message && req.body.message.text) {
      const chatId = req.body.message.chat.id;
      const text = req.body.message.text;
      const userId = req.body.message.from.id;
      
      console.log(`Mensagem de ${userId}: ${text}`);
      
      // Enviar resposta diretamente via API do Telegram
      const token = process.env.TELEGRAM_BOT_TOKEN || '';
      const telegramUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      
      let responseText = `Recebi sua mensagem: ${text}`;
      
      // Comandos básicos
      if (text === '/inicio' || text === '/start') {
        responseText = 'Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas!';
      } else if (text === '/ajuda' || text === '/help') {
        responseText = 'Comandos disponíveis: /inicio, /ajuda, /clientes';
      }
      
      // Enviar resposta
      await axios.post(telegramUrl, {
        chat_id: chatId,
        text: responseText
      });
      
      console.log('Resposta enviada com sucesso');
    }
    
    // Sempre retornar 200 OK para o Telegram
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(200).json({ ok: false, error: String(error) });
  }
}