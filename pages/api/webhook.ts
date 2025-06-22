// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  // Log para depuração
  console.log('Webhook recebido');
  
  // Simplesmente responda com sucesso
  res.status(200).json({ ok: true });
};

export default handler;