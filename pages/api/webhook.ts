// pages/api/webhook.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import { Telegraf } from 'telegraf'

// Crie uma instância do bot
const token = process.env.TELEGRAM_BOT_TOKEN || ''
const bot = new Telegraf(token)

// Configure comandos básicos
bot.command('inicio', (ctx) => {
  return ctx.reply('Olá! Sou o ZettiBot 🚀, seu assistente digital de vendas!')
})

bot.command('ajuda', (ctx) => {
  return ctx.reply('Comandos disponíveis: /inicio, /ajuda, /clientes')
})

// Capture todas as mensagens
bot.on('text', async (ctx) => {
  console.log('Mensagem recebida:', ctx.message.text)
  return ctx.reply(`Você disse: ${ctx.message.text}`)
})

// Handler principal do webhook
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    console.log('Webhook recebido:', req.method, JSON.stringify(req.body).slice(0, 200))

    // Se não for um POST, responder com erro
    if (req.method !== 'POST') {
      console.log('Método não permitido:', req.method)
      return res.status(200).json({ ok: false, status: 'method-not-allowed' })
    }

    // Verificar se o corpo da requisição é válido
    if (!req.body || !req.body.update_id) {
      console.log('Corpo inválido:', JSON.stringify(req.body))
      return res.status(200).json({ ok: false, status: 'invalid-body' })
    }

    // Processar manualmente o update do Telegram
    try {
      await bot.handleUpdate(req.body)
      console.log('Update processado com sucesso')
    } catch (botError) {
      console.error('Erro ao processar update:', botError)
    }

    // Sempre retornar 200 OK para o Telegram
    return res.status(200).json({ ok: true })
  } catch (error) {
    console.error('Erro geral no webhook:', error)
    return res.status(200).json({ ok: false, error: String(error) })
  }
}