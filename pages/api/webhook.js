import axios from 'axios';

export default async function handler(req, res) {
  // Log inicial
  console.log("Webhook chamado às", new Date().toISOString());
  console.log("Método:", req.method);
  
  // Apenas aceita POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: false, message: 'Método inválido' });
  }
  
  try {
    const update = req.body;
    console.log("Update recebido:", JSON.stringify(update));
    
    // Verifica se é uma mensagem válida
    if (update && update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      // Prepara resposta baseada no comando
      let responseText;
      if (text === '/inicio' || text === '/start') {
        responseText = 'Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas!';
      } else if (text === '/ajuda' || text === '/help') {
        responseText = 'Comandos disponíveis: /inicio, /ajuda';
      } else {
        responseText = `Você disse: ${text}`;
      }
      
      // Envia resposta diretamente via API
      const token = process.env.TELEGRAM_BOT_TOKEN;
      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text: responseText
      });
      
      console.log("Resposta enviada para", chatId);
    }
    
    // Responde OK para o Telegram
    return res.status(200).json({ ok: true });
    
  } catch (error) {
    console.error("Erro no webhook:", error);
    // Ainda responde 200 para o Telegram
    return res.status(200).json({ ok: false, error: String(error) });
  }
}