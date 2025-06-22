import axios from 'axios';

// Usar token do Telegram das variáveis de ambiente
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Função para enviar mensagens
export async function sendMessage(chatId: number | string, text: string, options = {}) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...options
    });
  } catch (error) {
    console.error('Erro ao enviar mensagem:', error);
  }
}