
import axios from 'axios';
import { adminSupabase } from '@/lib/supabase';
import { 
  buscarNotificacoesPendentes, 
  marcarNotificacaoComoEnviada, 
  marcarNotificacaoComoErro,
  limpezaNotificacoesAntigas 
} from './scheduler';
import { ResultadoProcessamento, NotificacaoProcessamento } from './types';
import { timestampLog } from './utils';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function enviarMensagemTelegram(telegramId: number, mensagem: string): Promise<boolean> {
  try {
    const response = await axios.post(`${TELEGRAM_API_URL}/sendMessage`, {
      chat_id: telegramId,
      text: mensagem,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });

    return response.status === 200;
  } catch (error) {
    console.error(`${timestampLog()} - Erro ao enviar mensagem Telegram:`, error);
    return false;
  }
}

export async function processarNotificacoesPendentes(): Promise<ResultadoProcessamento> {
  const inicioProcessamento = Date.now();
  
  console.log(`${timestampLog()} - 🔄 Iniciando processamento de notificações...`);

  const resultado: ResultadoProcessamento = {
    total_processadas: 0,
    total_enviadas: 0,
    total_erros: 0,
    tempo_processamento: 0,
    detalhes: {
      enviadas: [],
      erros: []
    }
  };

  try {
    // Buscar notificações pendentes
    const notificacoes = await buscarNotificacoesPendentes();
    resultado.total_processadas = notificacoes.length;

    if (notificacoes.length === 0) {
      console.log(`${timestampLog()} - ℹ️ Nenhuma notificação pendente encontrada`);
      resultado.tempo_processamento = Date.now() - inicioProcessamento;
      return resultado;
    }

    console.log(`${timestampLog()} - 📬 Encontradas ${notificacoes.length} notificações pendentes`);

    // Processar cada notificação
    for (const notificacao of notificacoes) {
      try {
        console.log(`${timestampLog()} - 📤 Processando notificação ${notificacao.id}...`);

        // Enviar mensagem via Telegram
        const enviado = await enviarMensagemTelegram(
          notificacao.telegram_id,
          notificacao.mensagem
        );

        if (enviado) {
          // Marcar como enviada
          const marcada = await marcarNotificacaoComoEnviada(notificacao.id);
          
          if (marcada) {
            resultado.total_enviadas++;
            resultado.detalhes.enviadas.push(notificacao.id);
            console.log(`${timestampLog()} - ✅ Notificação ${notificacao.id} enviada com sucesso`);
          } else {
            throw new Error('Falha ao marcar como enviada no banco');
          }
        } else {
          throw new Error('Falha no envio via Telegram');
        }

      } catch (error) {
        const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
        
        resultado.total_erros++;
        resultado.detalhes.erros.push({
          id: notificacao.id,
          erro: mensagemErro
        });

        // Marcar como erro e incrementar tentativas
        await marcarNotificacaoComoErro(notificacao.id, mensagemErro);
        
        console.error(`${timestampLog()} - ❌ Erro ao processar notificação ${notificacao.id}:`, mensagemErro);
      }

      // Pequena pausa entre envios para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Executar limpeza de notificações antigas (uma vez por dia)
    const agora = new Date();
    if (agora.getHours() === 2 && agora.getMinutes() < 5) { // Entre 02:00 e 02:05
      console.log(`${timestampLog()} - 🧹 Executando limpeza de notificações antigas...`);
      await limpezaNotificacoesAntigas();
    }

  } catch (error) {
    console.error(`${timestampLog()} - ❌ Erro crítico no processamento:`, error);
    resultado.total_erros = resultado.total_processadas;
  }

  resultado.tempo_processamento = Date.now() - inicioProcessamento;

  // Log do resultado final
  console.log(`${timestampLog()} - ✅ Processamento concluído em ${resultado.tempo_processamento}ms:`);
  console.log(`   📬 Processadas: ${resultado.total_processadas}`);
  console.log(`   ✅ Enviadas: ${resultado.total_enviadas}`);
  console.log(`   ❌ Erros: ${resultado.total_erros}`);

  return resultado;
}

export async function testarEnvioNotificacao(telegramId: number, mensagem: string): Promise<boolean> {
  try {
    console.log(`${timestampLog()} - 🧪 Testando envio para Telegram ID: ${telegramId}`);
    
    const enviado = await enviarMensagemTelegram(telegramId, mensagem);
    
    if (enviado) {
      console.log(`${timestampLog()} - ✅ Teste de envio realizado com sucesso`);
    } else {
      console.log(`${timestampLog()} - ❌ Falha no teste de envio`);
    }
    
    return enviado;
  } catch (error) {
    console.error(`${timestampLog()} - ❌ Erro no teste de envio:`, error);
    return false;
  }
}

// Função para reprocessar notificações com erro
export async function reprocessarNotificacoesErro(): Promise<ResultadoProcessamento> {
  const inicioProcessamento = Date.now();
  
  console.log(`${timestampLog()} - 🔄 Reprocessando notificações com erro...`);

  const resultado: ResultadoProcessamento = {
    total_processadas: 0,
    total_enviadas: 0,
    total_erros: 0,
    tempo_processamento: 0,
    detalhes: {
      enviadas: [],
      erros: []
    }
  };

  try {
    // Buscar notificações com status 'erro' e menos de 3 tentativas
    const { data: notificacoes } = await adminSupabase
      .from('notificacoes')
      .select('*')
      .eq('status', 'erro')
      .lt('tentativas', 3)
      .order('updated_at', { ascending: true })
      .limit(10); // Processar no máximo 10 por vez

    if (!notificacoes || notificacoes.length === 0) {
      console.log(`${timestampLog()} - ℹ️ Nenhuma notificação para reprocessar`);
      resultado.tempo_processamento = Date.now() - inicioProcessamento;
      return resultado;
    }

    resultado.total_processadas = notificacoes.length;
    console.log(`${timestampLog()} - 🔄 Reprocessando ${notificacoes.length} notificações`);

    for (const notificacao of notificacoes) {
      try {
        // Resetar status para pendente e tentar novamente
        await adminSupabase
          .from('notificacoes')
          .update({ status: 'pendente' })
          .eq('id', notificacao.id);

        resultado.total_enviadas++;
        resultado.detalhes.enviadas.push(notificacao.id);
        
        console.log(`${timestampLog()} - ✅ Notificação ${notificacao.id} marcada para reprocessamento`);
      } catch (error) {
        const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
        resultado.total_erros++;
        resultado.detalhes.erros.push({
          id: notificacao.id,
          erro: mensagemErro
        });
      }
    }

  } catch (error) {
    console.error(`${timestampLog()} - ❌ Erro no reprocessamento:`, error);
  }

  resultado.tempo_processamento = Date.now() - inicioProcessamento;
  return resultado;
}