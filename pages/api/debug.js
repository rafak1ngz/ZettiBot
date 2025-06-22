// pages/api/debug.js
import axios from 'axios';

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = req.query.chat_id;
    
    // Formatação da resposta
    let responseData = {
      status: 'ok',
      time: new Date().toISOString(),
      token_exists: !!token,
      env_variables: {
        TOKEN_LENGTH: token ? token.length : 0
      }
    };
    
    // Se um chat_id foi fornecido, tentar enviar mensagem
    if (chatId) {
      try {
        const response = await axios.post(
          `https://api.telegram.org/bot${token}/sendMessage`, 
          {
            chat_id: chatId,
            text: "🛠️ Teste do ZettiBot! Se você está vendo isso, o bot está funcionando."
          }
        );
        
        responseData.message_sent = true;
        responseData.telegram_response = response.data;
      } catch (error) {
        responseData.message_sent = false;
        responseData.message_error = String(error.message);
      }
    }
    
    // Verificar webhook
    try {
      const webhookInfo = await axios.get(
        `https://api.telegram.org/bot${token}/getWebhookInfo`
      );
      responseData.webhook_info = webhookInfo.data;
    } catch (webhookError) {
      responseData.webhook_error = String(webhookError.message);
    }
    
    return res.status(200).json(responseData);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      error: String(error.message)
    });
  }
}