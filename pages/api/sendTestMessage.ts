// pages/api/sendTestMessage.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const chatId = req.query.chatId;
    
    if (!chatId) {
      return res.status(400).json({ error: 'ChatId é necessário' });
    }
    
    const token = process.env.TELEGRAM_BOT_TOKEN;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: 'Esta é uma mensagem de teste do ZettiBot 🤖'
    });
    
    return res.status(200).json({ success: true, message: 'Mensagem enviada' });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
    return res.status(500).json({ error: String(error) });
  }
}