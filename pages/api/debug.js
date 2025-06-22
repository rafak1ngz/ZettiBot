import axios from 'axios';

export default async function handler(req, res) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      return res.status(200).json({
        status: 'error',
        message: 'Token do Telegram não configurado'
      });
    }
    
    // Verifica informações do webhook
    const webhookInfo = await axios.get(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    
    // Tenta enviar mensagem de teste
    let messageResult = null;
    
    if (req.query.chat_id) {
      try {
        const sendMessage = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: req.query.chat_id,
          text: '🤖 Mensagem de teste do ZettiBot'
        });
        messageResult = sendMessage.data;
      } catch (msgError) {
        messageResult = {
          error: true,
          message: String(msgError)
        };
      }
    }
    
    return res.status(200).json({
      status: 'ok',
      time: new Date().toISOString(),
      token_present: !!token,
      token_length: token ? token.length : 0,
      webhook_info: webhookInfo.data,
      message_result: messageResult,
      query_params: req.query
    });
    
  } catch (error) {
    return res.status(200).json({
      status: 'error',
      message: String(error),
      time: new Date().toISOString(),
    });
  }
}