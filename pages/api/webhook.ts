// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Telegraf } from 'telegraf';

// Inicializa o bot com o token
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN || '');

// Comandos básicos
bot.start((ctx) => ctx.reply('Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas!'));
bot.help((ctx) => ctx.reply('Comandos disponíveis: /inicio, /ajuda, /clientes'));
bot.command('ajuda', (ctx) => ctx.reply('Lista de comandos disponíveis...'));

// Comando de fallback para mensagens não reconhecidas
bot.on('text', (ctx) => {
  ctx.reply(`Recebi sua mensagem: ${ctx.message.text}. Digite /ajuda para ver os comandos.`);
});

// Função para processar updates do Telegram
async function processUpdate(update: any) {
  try {
    await bot.handleUpdate(update);
    return true;
  } catch (error) {
    console.error('Erro ao processar update:', error);
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  console.log('Webhook recebido', req.method);
  
  // Apenas aceitar requisições POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: false, message: 'Método não permitido' });
  }

  try {
    // Processar o update do Telegram
    const success = await processUpdate(req.body);
    return res.status(200).json({ ok: success });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return res.status(200).json({ ok: false, error: String(error) });
  }
}