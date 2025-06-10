import bot from '../../lib/telegram-bot';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    // Importante: desabilitar o bodyParser padrão
    externalResolver: true, 
  },
};

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') {
      // Verifica se o corpo da requisição existe
      if (!req.body) {
        return res.status(400).json({ error: 'Request body is empty' });
      }

      // Processa a atualização do Telegram
      await bot.handleUpdate(req.body);
      res.status(200).json({ ok: true });
    } else if (req.method === 'GET') {
      // Para configuração inicial do webhook
      // Obter URL segura
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}`
        : `https://${req.headers.host}`;
      
      const webhookUrl = `${baseUrl}/api/webhook`;
      
      try {
        // Configurar o webhook do bot
        await bot.telegram.setWebhook(webhookUrl);
        
        // Verificar a configuração
        const webhookInfo = await bot.telegram.getWebhookInfo();
        
        res.status(200).json({ 
          success: true, 
          webhook: webhookUrl,
          info: webhookInfo
        });
      } catch (error) {
        console.error('Webhook setup error:', error);
        res.status(500).json({ 
          success: false, 
          error: error.message,
          stack: error.stack 
        });
      }
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ 
      error: error.toString(),
      stack: error.stack 
    });
  }
}