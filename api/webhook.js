const axios = require('axios');

module.exports = async (req, res) => {
  // Retornar OK para evitar timeouts do Telegram
  if (req.method === 'POST') {
    // Responder ao Telegram imediatamente
    res.status(200).json({ status: 'ok' });
    
    try {
      // Processar a mensagem de forma assíncrona
      const update = req.body;
      
      if (update && update.message && update.message.text) {
        const chatId = update.message.chat.id;
        const text = update.message.text;
        
        // Log simples
        console.log(`Mensagem recebida: ${text} de ${chatId}`);
        
        // Envio direto e simples
        const botToken = process.env.BOT_TOKEN;
        
        // Respostas simples sem caracteres especiais
        let responseText = "Comando recebido!";
        
        if (text === '/start') {
          responseText = "Bot iniciado! Use /help para ver comandos.";
        } else if (text === '/help' || text === '/ajuda') {
          responseText = "Comandos: /start, /help, /agenda, /clientes, /followup";
        }
        
        // Envio básico
        await axios({
          method: 'post',
          url: `https://api.telegram.org/bot${botToken}/sendMessage`,
          data: {
            chat_id: chatId,
            text: responseText
          },
          timeout: 5000
        });
      }
    } catch (error) {
      console.error("Erro:", error.message);
    }
    
    return;
  }
  
  // Para GET
  return res.status(200).send('ZettiBot esta funcionando!');
};