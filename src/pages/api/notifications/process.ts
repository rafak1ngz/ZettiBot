import { NextApiRequest, NextApiResponse } from 'next';
import { processarNotificacoesPendentes, limparNotificacaoAntigas } from '@/lib/telegram/notifications/sender';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verificar método HTTP
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Método não permitido',
      allowed: ['POST'] 
    });
  }

  try {
    // Verificar autenticação do cron job
    const authHeader = req.headers.authorization;
    const expectedToken = process.env.WEBHOOK_SECURITY_KEY;

    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      console.warn('Tentativa de acesso não autorizado ao processador de notificações');
      return res.status(401).json({ error: 'Não autorizado' });
    }

    console.log('🚀 Iniciando processamento de notificações via cron job...');

    // Processar notificações pendentes
    const resultado = await processarNotificacoesPendentes();

    // Se foi passado parâmetro para limpeza, executar
    const limparAntigas = req.query.cleanup === 'true';
    let resultadoLimpeza = null;

    if (limparAntigas) {
      console.log('🗑️ Executando limpeza de notificações antigas...');
      resultadoLimpeza = await limparNotificacaoAntigas(30); // 30 dias
    }

    // Preparar resposta
    const resposta = {
      timestamp: new Date().toISOString(),
      status: 'sucesso',
      processamento: {
        notificacoes_processadas: resultado.processadas,
        notificacoes_enviadas: resultado.enviadas,
        erros: resultado.erros,
        detalhes: resultado.detalhes
      },
      ...(resultadoLimpeza && {
        limpeza: {
          notificacoes_removidas: resultadoLimpeza.removidas,
          erro_limpeza: resultadoLimpeza.erro
        }
      })
    };

    // Log do resultado
    console.log('📊 Resultado do processamento:', resposta);

    // Status HTTP baseado no resultado
    const statusCode = resultado.erros > 0 ? 206 : 200; // 206 = Partial Content (com erros)

    return res.status(statusCode).json(resposta);

  } catch (error) {
    console.error('❌ Erro crítico no endpoint de notificações:', error);

    return res.status(500).json({
      timestamp: new Date().toISOString(),
      status: 'erro',
      error: 'Erro interno do servidor',
      details: error instanceof Error ? error.message : 'Erro desconhecido'
    });
  }
}

// Configuração para permitir processamento mais longo (útil para muitas notificações)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: '8mb',
  },
  // Timeout de 30 segundos (padrão Vercel é 10s para hobby plan)
  maxDuration: 30,
};