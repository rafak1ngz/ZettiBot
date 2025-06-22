import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Registrar informações de diagnóstico
  console.log('Webhook chamado', { method: req.method, url: req.url });
  
  // Debug do corpo da requisição
  if (req.body) {
    console.log('Corpo da requisição:', JSON.stringify(req.body, null, 2));
  }

  // Sempre responder com sucesso para o Telegram
  res.status(200).json({ ok: true, message: 'webhook recebido' })
}