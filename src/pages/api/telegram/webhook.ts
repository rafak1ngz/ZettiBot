import { NextApiRequest, NextApiResponse } from 'next';
import bot from '@/lib/telegram';

export default async function handler(
  req: NextApiRequest, 
  res: NextApiResponse
) {
  try {
    console.log('Webhook received:', JSON.stringify(req.body, null, 2));
    // Verify security key
    const securityKey = req.headers['x-telegram-bot-api-secret-token'];
    if (securityKey !== process.env.WEBHOOK_SECURITY_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Process update
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      return res.status(200).end();
    }
    
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Webhook full error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error });
  }
}

// Disable body parsing, we need the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};