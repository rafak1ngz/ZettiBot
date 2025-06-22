import type { NextApiRequest, NextApiResponse } from 'next'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    status: 'ok',
    time: new Date().toISOString(),
    env: process.env.TELEGRAM_BOT_TOKEN ? 'Token configurado' : 'Token não encontrado'
  })
}