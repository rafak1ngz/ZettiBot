import { NextApiRequest, NextApiResponse } from 'next';
import { testarEnvioNotificacao, criarNotificacao } from '@/lib/telegram/notifications';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Método não permitido' });
  }

  try {
    // Verificar autenticação
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WEBHOOK_SECURITY_KEY}`;
    
    if (authHeader !== expectedAuth) {
      return res.status(401).json({ erro: 'Não autorizado' });
    }

    const { telegram_id, tipo_teste } = req.body;

    if (!telegram_id) {
      return res.status(400).json({ erro: 'telegram_id é obrigatório' });
    }

    switch (tipo_teste) {
      case 'envio_direto':
        // Teste de envio direto
        const mensagemTeste = `🧪 <b>Teste de Notificação ZettiBot</b>\n\n` +
                              `⏰ ${new Date().toLocaleString('pt-BR')}\n\n` +
                              `✅ Sistema de notificações funcionando corretamente!`;
        
        const enviado = await testarEnvioNotificacao(telegram_id, mensagemTeste);
        
        return res.status(200).json({
          sucesso: enviado,
          tipo: 'envio_direto',
          timestamp: new Date().toISOString()
        });

      case 'agendamento':
        // Teste de agendamento (notificação em 1 minuto)
        const dataAgendamento = new Date();
        dataAgendamento.setMinutes(dataAgendamento.getMinutes() + 1);

        const notificacao = await criarNotificacao({
          user_id: 'teste-user',
          telegram_id: telegram_id,
          tipo: 'agenda',
          titulo: 'Teste de Agendamento',
          mensagem: `🧪 <b>Teste de Agendamento ZettiBot</b>\n\n` +
                   `📅 Esta notificação foi agendada para 1 minuto após o teste.\n\n` +
                   `⏰ Horário de criação: ${new Date().toLocaleString('pt-BR')}\n` +
                   `⏰ Horário de envio: ${dataAgendamento.toLocaleString('pt-BR')}\n\n` +
                   `✅ Se você recebeu esta mensagem, o sistema está funcionando!`,
          agendado_para: dataAgendamento
        });

        return res.status(200).json({
          sucesso: notificacao.sucesso,
          tipo: 'agendamento',
          agendado_para: dataAgendamento.toISOString(),
          notificacao_id: notificacao.id,
          erro: notificacao.erro,
          timestamp: new Date().toISOString()
        });

      default:
        return res.status(400).json({ 
          erro: 'tipo_teste inválido',
          tipos_aceitos: ['envio_direto', 'agendamento']
        });
    }

  } catch (error) {
    console.error('Erro no teste de notificações:', error);
    
    return res.status(500).json({
      sucesso: false,
      erro: 'Erro interno do servidor',
      detalhes: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

// Exemplo de uso:
// POST /api/notifications/test
// Headers: Authorization: Bearer f3a9d7b0-4b12-4e02-a87e-df3c9ac24177
// Body: { "telegram_id": 123456789, "tipo_teste": "envio_direto" }
// Body: { "telegram_id": 123456789, "tipo_teste": "agendamento" }