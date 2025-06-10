import bot from '../../lib/telegram-bot';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
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
      return res.status(200).json({ ok: true });
    } 
    else if (req.method === 'GET') {
      // Usar a variável de ambiente para URL do webhook
      const webhookUrl = process.env.WEBHOOK_URL 
        ? `${process.env.WEBHOOK_URL}/api/webhook`
        : `https://${req.headers.host}/api/webhook`;
      
      try {
        // Configurar webhook do Telegram
        await bot.telegram.setWebhook(webhookUrl);
        
        // Verificar configuração
        const webhookInfo = await bot.telegram.getWebhookInfo();
        
        return res.status(200).json({ 
          success: true, 
          webhook: webhookUrl,
          info: webhookInfo
        });
      } catch (error) {
        console.error('Webhook setup error:', error);
        return res.status(500).json({ 
          success: false, 
          error: error.message 
        });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Webhook handler error:', error);
    return res.status(500).json({ error: error.toString() });
  }
}