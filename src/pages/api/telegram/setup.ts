import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Only allow setup with proper authentication
    const apiKey = req.query.apiKey as string;
    if (apiKey !== process.env.WEBHOOK_SECURITY_KEY) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const webhookUrl = `${process.env.WEBHOOK_URL}/api/telegram/webhook`;
    const secretToken = process.env.WEBHOOK_SECURITY_KEY;

    // Configure webhook
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        url: webhookUrl,
        secret_token: secretToken,
        drop_pending_updates: true,
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    console.error('Setup error:', error);
    return res.status(500).json({ error: 'Failed to setup webhook' });
  }
}