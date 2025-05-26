const axios = require('axios');

module.exports = async (req, res) => {
  // Log da requisição
  console.log(`Método: ${req.method}, Origem: ${req.headers['x-forwarded-for'] || 'desconhecido'}`);

  // Para GET
  if (req.method === 'GET') {
    return res.status(200).send('ZettiBot está funcionando!');
  }

  // Para POST (webhook do Telegram)
  if (req.method === 'POST') {
    try {
      // Resposta imediata para o Telegram
      res.status(200).json({ status: 'ok' });
      
      // Processar update manualmente
      const update = req.body;
      console.log('Update recebido:', JSON.stringify(update).substring(0, 200));
      
      // Verificar se é uma mensagem com comando
      if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        
        // Enviar mensagem diretamente para o chat
        testSendMessage(chatId, `Recebi seu comando: ${text}`);
      }
      
      return;
    } catch (error) {
      console.error('Erro:', error);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  // Outros métodos
  return res.status(405).send('Método não permitido');
};

// Função simplificada para enviar mensagem
async function testSendMessage(chatId, text) {
  try {
    const botToken = process.env.BOT_TOKEN;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    console.log(`Tentando enviar mensagem para ${chatId}: ${text}`);
    
    const response = await axios({
      method: 'post',
      url: url,
      data: {
        chat_id: chatId,
        text: text
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    console.log('Resposta:', response.status, JSON.stringify(response.data));
  } catch (error) {
    console.error('Erro ao enviar mensagem:', 
      error.response ? JSON.stringify({
        status: error.response.status,
        data: error.response.data
      }) : error.message
    );
  }
}