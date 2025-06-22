import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log("Webhook recebido", new Date().toISOString());

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método não permitido' });
  }

  try {
    const { body } = req;
    console.log("Dados recebidos:", JSON.stringify(body));

    // Verificar se é uma mensagem válida
    if (body && body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const text = body.message.text;
      
      console.log(`Mensagem recebida: ${text} de ${chatId}`);
      
      // Resposta básica para qualquer comando
      let responseText = 'Olá! Recebi sua mensagem.';
      
      // Verificar comandos específicos
      if (text === '/inicio') {
        responseText = 'Bem-vindo ao ZettiBot! Este é o comando de início.';
      } else if (text === '/ajuda') {
        responseText = 'Aqui está a lista de comandos disponíveis...';
      }
      
      // Enviar resposta
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id: chatId,
        text: responseText
      });
      
      console.log("Resposta enviada com sucesso");
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(200).json({ success: false, error: String(error) });
  }
}