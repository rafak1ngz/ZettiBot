import { adminSupabase } from '@/lib/supabase';
import { 
  buscarNotificacoesPendentes,
  marcarNotificacaoEnviada,
  marcarNotificacaoErro 
} from './scheduler';

/**
 * Envia notificação via Telegram
 */
async function enviarTelegram(
  telegramId: number, 
  titulo: string, 
  mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!token) {
      throw new Error('Token do Telegram não configurado');
    }

    // Formatar mensagem
    const textoCompleto = `*${titulo}*\n\n${mensagem}`;
    
    // Enviar via API do Telegram
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramId,
        text: textoCompleto,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      }),
    });

    const resultado = await response.json();

    if (!response.ok || !resultado.ok) {
      throw new Error(resultado.description || 'Erro desconhecido do Telegram');
    }

    return { sucesso: true };

  } catch (error) {
    console.error('Erro ao enviar Telegram:', error);
    return { 
      sucesso: false, 
      erro: error instanceof Error ? error.message : 'Erro desconhecido' 
    };
  }
}

/**
 * Envia notificação via Email (placeholder para implementação futura)
 */
async function enviarEmail(
  email: string, 
  titulo: string, 
  mensagem: string
): Promise<{ sucesso: boolean; erro?: string }> {
  // TODO: Implementar envio por email
  console.log(`Email placeholder - Para: ${email}, Título: ${titulo}`);
  
  return { 
    sucesso: false, 
    erro: 'Envio por email ainda não implementado' 
  };
}

/**
 * Processa uma notificação individual
 */
async function processarNotificacao(notificacao: any): Promise<void> {
  try {
    console.log(`Processando notificação ${notificacao.id} para usuário ${notificacao.user_id}`);

    const telegramId = notificacao.users?.telegram_id;
    
    if (!telegramId) {
      throw new Error('Telegram ID não encontrado para o usuário');
    }

    // Enviar via Telegram
    const resultado = await enviarTelegram(
      telegramId,
      notificacao.titulo,
      notificacao.mensagem
    );

    if (resultado.sucesso) {
      await marcarNotificacaoEnviada(notificacao.id);
      console.log(`✅ Notificação ${notificacao.id} enviada com sucesso`);
    } else {
      await marcarNotificacaoErro(
        notificacao.id, 
        resultado.erro || 'Erro desconhecido',
        notificacao.tentativas
      );
      console.log(`❌ Erro ao enviar notificação ${notificacao.id}: ${resultado.erro}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro inesperado';
    
    await marcarNotificacaoErro(
      notificacao.id,
      errorMessage,
      notificacao.tentativas
    );
    
    console.error(`❌ Erro ao processar notificação ${notificacao.id}:`, error);
  }
}

/**
 * Processa todas as notificações pendentes
 * Esta função é chamada pelo cron job
 */
export async function processarNotificacoesPendentes(): Promise<{
  processadas: number;
  enviadas: number;
  erros: number;
  detalhes?: string;
}> {
  const inicioProcessamento = Date.now();
  let processadas = 0;
  let enviadas = 0;
  let erros = 0;

  try {
    console.log('🔄 Iniciando processamento de notificações...');

    // Buscar notificações pendentes
    const { notificacoes, erro } = await buscarNotificacoesPendentes(50);

    if (erro) {
      return {
        processadas: 0,
        enviadas: 0,
        erros: 1,
        detalhes: `Erro ao buscar notificações: ${erro}`
      };
    }

    if (notificacoes.length === 0) {
      console.log('ℹ️ Nenhuma notificação pendente encontrada');
      return { processadas: 0, enviadas: 0, erros: 0 };
    }

    console.log(`📬 Encontradas ${notificacoes.length} notificações pendentes`);

    // Processar cada notificação
    for (const notificacao of notificacoes) {
      processadas++;
      
      try {
        await processarNotificacao(notificacao);
        enviadas++;
      } catch (error) {
        erros++;
        console.error(`Erro ao processar notificação ${notificacao.id}:`, error);
      }

      // Pequena pausa entre envios para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const tempoProcessamento = Date.now() - inicioProcessamento;
    
    console.log(`✅ Processamento concluído em ${tempoProcessamento}ms:`);
    console.log(`   📬 Processadas: ${processadas}`);
    console.log(`   ✅ Enviadas: ${enviadas}`);
    console.log(`   ❌ Erros: ${erros}`);

    return { processadas, enviadas, erros };

  } catch (error) {
    console.error('❌ Erro crítico no processamento de notificações:', error);
    
    return {
      processadas,
      enviadas,
      erros: erros + 1,
      detalhes: `Erro crítico: ${error instanceof Error ? error.message : 'Erro desconhecido'}`
    };
  }
}

/**
 * Função de teste para envio individual
 */
export async function testarEnvioNotificacao(
  telegramId: number,
  titulo: string = 'Teste ZettiBot',
  mensagem: string = 'Esta é uma mensagem de teste do sistema de notificações.'
): Promise<{ sucesso: boolean; erro?: string }> {
  return await enviarTelegram(telegramId, titulo, mensagem);
}

/**
 * Limpar notificações antigas (manutenção)
 */
export async function limparNotificacaoAntigas(diasAntigos: number = 30): Promise<{
  removidas: number;
  erro?: string;
}> {
  try {
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - diasAntigos);

    const { count, error } = await adminSupabase
      .from('notificacoes')
      .delete()
      .in('status', ['enviado', 'erro', 'cancelado'])
      .lt('created_at', dataLimite.toISOString());

    if (error) {
      console.error('Erro ao limpar notificações antigas:', error);
      return { 
        removidas: 0, 
        erro: 'Erro ao limpar notificações antigas' 
      };
    }

    console.log(`🗑️ Removidas ${count || 0} notificações antigas`);
    
    return { removidas: count || 0 };

  } catch (error) {
    console.error('Erro inesperado ao limpar notificações:', error);
    return { 
      removidas: 0, 
      erro: 'Erro inesperado no sistema' 
    };
  }
}