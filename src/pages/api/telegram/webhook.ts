import { NextApiRequest, NextApiResponse } from 'next';
import bot from '@/lib/telegram';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Verificar segurança
    const securityKey = req.headers['x-telegram-bot-api-secret-token'];
    if (securityKey !== process.env.WEBHOOK_SECURITY_KEY) {
      console.log('Security key mismatch:', securityKey);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Processar update
    if (req.method === 'POST') {
      // Garantir que temos um body válido
      if (!req.body || typeof req.body !== 'object') {
        console.log('Invalid request body:', req.body);
        return res.status(400).json({ error: 'Invalid request body' });
      }

      console.log('Webhook received:', JSON.stringify(req.body, null, 2));

      await bot.handleUpdate(req.body);
      return res.status(200).end();
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Webhook full error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Importante: Permitir o parsing do corpo
export const config = {
  api: {
    bodyParser: true, // Mudar para true
  },
};