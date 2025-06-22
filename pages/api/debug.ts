// pages/api/debug.ts
import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ 
    status: 'ok', 
    message: 'Endpoint de debug funcional',
    timestamp: new Date().toISOString(),
    env: process.env.TELEGRAM_BOT_TOKEN ? 'Token configurado' : 'Token ausente',
    webhookUrl: 'https://zettibot.vercel.app/api/webhook'
  })
}