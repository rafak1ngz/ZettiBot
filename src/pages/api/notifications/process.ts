import { NextApiRequest, NextApiResponse } from 'next';
import { processarNotificacoesPendentes } from '@/lib/telegram/notifications';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      erro: 'Método não permitido',
      metodo_aceito: 'POST' 
    });
  }

  try {
    // Verificar autenticação (security key)
    const authHeader = req.headers.authorization;
    const expectedAuth = `Bearer ${process.env.WEBHOOK_SECURITY_KEY}`;
    
    if (authHeader !== expectedAuth) {
      console.log('❌ Tentativa de acesso não autorizada ao endpoint de notificações');
      return res.status(401).json({ 
        erro: 'Não autorizado',
        timestamp: new Date().toISOString()
      });
    }

    console.log('🔄 Endpoint de notificações chamado via cron job');

    // Processar notificações pendentes
    const resultado = await processarNotificacoesPendentes();

    // Retornar resultado
    return res.status(200).json({
      sucesso: true,
      timestamp: new Date().toISOString(),
      resultado: {
        processadas: resultado.total_processadas,
        enviadas: resultado.total_enviadas,
        erros: resultado.total_erros,
        tempo_ms: resultado.tempo_processamento
      },
      detalhes: {
        notificacoes_enviadas: resultado.detalhes.enviadas,
        erros_encontrados: resultado.detalhes.erros.map(e => ({
          id: e.id,
          erro: e.erro
        }))
      }
    });

  } catch (error) {
    console.error('❌ Erro crítico no endpoint de notificações:', error);
    
    return res.status(500).json({
      sucesso: false,
      erro: 'Erro interno do servidor',
      timestamp: new Date().toISOString(),
      detalhes: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

// Configuração para permitir requests sem timeout muito baixo
export const config = {
  api: {
    responseLimit: false,
  },
};