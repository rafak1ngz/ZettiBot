import TelegramBot from 'node-telegram-bot-api';

// Configuração do bot
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token);

// Objeto para armazenar a instância TelegramBot entre requisições
let botInstance = null;

export default async function handler(req, res) {
  console.log('Webhook recebido:', req.method);
  
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: false, message: 'Método não permitido' });
  }
  
  try {
    // Processar atualização
    const update = req.body;
    console.log('Update recebido:', JSON.stringify(update));
    
    // Verificar se é uma mensagem
    if (update && update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text;
      
      console.log(`Mensagem recebida: ${chatId} : ${text}`);
      
      // Responder conforme comando
      let responseText = '';
      
      if (text === '/inicio' || text === '/start') {
        responseText = 'Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas!';
      } 
      else if (text === '/ajuda' || text === '/help') {
        responseText = 'Comandos disponíveis: /inicio, /ajuda';
      }
      else {
        responseText = `Você disse: ${text}`;
      }
      
      // Enviar resposta diretamente via API
      await bot.sendMessage(chatId, responseText);
      console.log('Resposta enviada com sucesso');
    }
    
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(200).json({ ok: false, error: String(error) });
  }
}