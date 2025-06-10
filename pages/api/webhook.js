import bot from '../../lib/telegram-bot';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // Processa a atualização do Telegram
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } else if (req.method === 'GET') {
      // Endpoint para configurar webhook (você pode acessar esta URL para configurar)
      const webhookUrl = `${process.env.VERCEL_URL || req.headers.host}/api/webhook`;
      
      try {
        await bot.telegram.setWebhook(
          `https://${webhookUrl}`
        );
        res.status(200).json({ 
          success: true, 
          message: `Webhook set to https://${webhookUrl}`
        });
      } catch (error) {
        console.error('Webhook setup error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: error.toString() });
  }
}