const axios = require('axios');

module.exports = async (req, res) => {
  // Verificar se tem chave de segurança
  const secretKey = req.query.key;
  if (secretKey !== process.env.SETUP_KEY) {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }

  try {
    const botToken = process.env.BOT_TOKEN;
    const webhookUrl = `https://zettibot.vercel.app/api/webhook`;
    
    // Deletar webhook existente
    const deleteResponse = await axios.get(
      `https://api.telegram.org/bot${botToken}/deleteWebhook`
    );
    
    // Configurar novo webhook
    const setResponse = await axios.get(
      `https://api.telegram.org/bot${botToken}/setWebhook`,
      {
        params: {
          url: webhookUrl,
          drop_pending_updates: true
        }
      }
    );
    
    // Verificar status do webhook
    const infoResponse = await axios.get(
      `https://api.telegram.org/bot${botToken}/getWebhookInfo`
    );
    
    // Enviar mensagem de teste para você
    const testChatId = req.query.chatId || '1233176656'; // Seu chat_id
    const testResponse = await axios.post(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        chat_id: testChatId,
        text: `🤖 Webhook configurado em ${new Date().toISOString()}\nURL: ${webhookUrl}`
      }
    );
    
    return res.status(200).json({
      delete: deleteResponse.data,
      set: setResponse.data,
      info: infoResponse.data,
      test: testResponse.data
    });
  } catch (error) {
    console.error('Erro na configuração:', error);
    return res.status(500).json({
      error: error.message,
      response: error.response ? error.response.data : null
    });
  }
};