import type { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log para depuração
  console.log('Webhook chamado', { method: req.method, body: req.body })
  
  try {
    // Verificar se é uma mensagem do Telegram
    const { body } = req
    
    if (body && body.message && body.message.text) {
      const chatId = body.message.chat.id
      const text = body.message.text
      
      // Enviar resposta simples
      const token = process.env.TELEGRAM_BOT_TOKEN
      await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        { chat_id: chatId, text: `Você enviou: ${text}` }
      )
    }
    
    // Telegram exige resposta 200 OK
    res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Erro:', error)
    // Ainda retornamos 200 para o Telegram
    res.status(200).json({ ok: false, error: String(error) })
  }
}